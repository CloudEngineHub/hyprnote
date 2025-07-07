use serde::de::DeserializeOwned;

use backon::{ConstantBuilder, Retryable};
use futures_util::{SinkExt, Stream, StreamExt};
use tokio_tungstenite::{connect_async, tungstenite::client::IntoClientRequest};

pub use tokio_tungstenite::tungstenite::{protocol::Message, ClientRequestBuilder};

pub trait WebSocketIO: Send + 'static {
    type Input: Send + Default;
    type Output: DeserializeOwned;

    fn to_input(data: bytes::Bytes) -> Self::Input;
    fn to_message(input: Self::Input) -> Message;
    fn from_message(msg: Message) -> Option<Self::Output>;
}

pub struct WebSocketClient {
    request: ClientRequestBuilder,
}

impl WebSocketClient {
    pub fn new(request: ClientRequestBuilder) -> Self {
        Self { request }
    }

    pub async fn from_audio<T: WebSocketIO>(
        &self,
        mut audio_stream: impl Stream<Item = bytes::Bytes> + Send + Unpin + 'static,
    ) -> Result<impl Stream<Item = T::Output>, crate::Error> {
        let ws_stream = (|| self.try_connect(self.request.clone()))
            .retry(
                ConstantBuilder::default()
                    .with_max_times(20)
                    .with_delay(std::time::Duration::from_millis(500)),
            )
            .when(|e| {
                tracing::error!("ws_connect_failed: {:?}", e);
                true
            })
            .sleep(tokio::time::sleep)
            .await?;

        let (mut ws_sender, mut ws_receiver) = ws_stream.split();

        let send_task = tokio::spawn(async move {
            let mut audio_stream = audio_stream.fuse();
            let mut ping_interval = tokio::time::interval(std::time::Duration::from_secs(15));
            let mut send_end_marker = true;

            loop {
                tokio::select! {
                    biased; // Prioritize draining the audio stream over sending pings.

                    // Handle next audio chunk.
                    data = audio_stream.next() => {
                        if let Some(data) = data {
                            let input = T::to_input(data);
                            let msg = T::to_message(input);

                            if let Err(e) = ws_sender.send(msg).await {
                                use tokio_tungstenite::tungstenite::{error::ProtocolError, Error as WsError};

                                let is_normal_close = matches!(
                                    e,
                                    WsError::AlreadyClosed |
                                    WsError::ConnectionClosed |
                                    WsError::Protocol(ProtocolError::SendAfterClosing)
                                ) || matches!(e, WsError::Io(ref io_err) if io_err.kind() == std::io::ErrorKind::BrokenPipe);

                                if is_normal_close {
                                    tracing::debug!("ws_send_closed: {:?}", e);
                                } else {
                                    tracing::error!("ws_send_failed: {:?}", e);
                                }
                                send_end_marker = false;
                                break;
                            }
                        } else {
                            // Audio stream ended, exit loop.
                            break;
                        }
                    },
                    // Send a ping to keep the connection alive.
                    _ = ping_interval.tick() => {
                        if let Err(e) = ws_sender.send(Message::Ping(vec![].into())).await {
                            tracing::debug!("ws_ping_failed: {:?}", e);
                            send_end_marker = false;
                            break;
                        }
                    }
                }
            }

            if send_end_marker {
                // We shouldn't send a 'Close' message, as it would prevent receiving remaining transcripts from the server.
                let _ = ws_sender.send(T::to_message(T::Input::default())).await;
            }

            // Gracefully close the sender side of the websocket.
            if let Err(e) = ws_sender.close().await {
                tracing::debug!("ws_sender.close() failed: {:?}", e);
            }
        });

        let output_stream = async_stream::stream! {
            // This struct ensures that the send_task is aborted when the stream is dropped.
            struct AbortOnDrop(tokio::task::JoinHandle<()>);
            impl Drop for AbortOnDrop {
                fn drop(&mut self) {
                    self.0.abort();
                }
            }
            let _guard = AbortOnDrop(send_task);

            loop {
                const TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);
                match tokio::time::timeout(TIMEOUT, ws_receiver.next()).await {
                    Ok(Some(msg_result)) => {
                        match msg_result {
                            Ok(msg) => {
                                match msg {
                                    Message::Text(_) | Message::Binary(_) => {
                                        if let Some(output) = T::from_message(msg) {
                                            yield output;
                                        }
                                    },
                                    Message::Ping(_) => continue, // tungstenite handles pongs automatically.
                                    Message::Pong(_) => continue, // We sent the pings, no action needed for pongs.
                                    Message::Frame(_) => continue,
                                    Message::Close(_) => break,
                                }
                            }
                            Err(e) => {
                                if let tokio_tungstenite::tungstenite::Error::Protocol(tokio_tungstenite::tungstenite::error::ProtocolError::ResetWithoutClosingHandshake) = e {
                                    tracing::debug!("ws_receiver_failed: {:?}", e);
                                } else {
                                    tracing::error!("ws_receiver_failed: {:?}", e);
                                }
                                break;
                            }
                        }
                    },
                    Ok(None) => {
                        // Stream closed by server.
                        break;
                    }
                    Err(_) => {
                        // Timeout.
                        tracing::warn!("WebSocket receiver timed out after {}s of inactivity.", TIMEOUT.as_secs());
                        break;
                    }
                }
            }
        };

        Ok(output_stream)
    }

    async fn try_connect(
        &self,
        req: ClientRequestBuilder,
    ) -> Result<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
        crate::Error,
    > {
        let req = req.into_client_request().unwrap();

        tracing::info!("connect_async: {:?}", req.uri());

        let (ws_stream, _) =
            tokio::time::timeout(std::time::Duration::from_secs(8), connect_async(req)).await??;

        Ok(ws_stream)
    }
}
