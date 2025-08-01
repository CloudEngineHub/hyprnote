#[derive(clap::Args)]
pub struct ServeArgs {
    #[arg(short, long)]
    pub config_path: String,
    #[arg(short, long)]
    pub port: u16,
}

pub async fn handle_serve(args: ServeArgs) -> anyhow::Result<()> {
    let config = owhisper_config::Config::new(&args.config_path);

    let aws_service = hypr_transcribe_aws::TranscribeService::new(
        hypr_transcribe_aws::TranscribeConfig::default(),
    )
    .await
    .unwrap();

    let whisper_cpp_service = hypr_transcribe_whisper_local::WhisperStreamingService::builder()
        .model_path(config.serve.unwrap().whisper_cpp.unwrap().model_path.into())
        .build();

    let stt_router = axum::Router::new()
        .route_service("/aws", aws_service)
        .route_service("/whisper-cpp", whisper_cpp_service);

    let app = axum::Router::new()
        .route("/health", axum::routing::get(health))
        .merge(stt_router);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", args.port))
        .await
        .unwrap();

    axum::serve(listener, app).await.unwrap();

    Ok(())
}

async fn health() -> &'static str {
    "OK"
}
