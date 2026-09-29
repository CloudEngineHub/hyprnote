use crate::{Event, Participant, Transcript, common_derives};
#[allow(unused_imports)]
use anlg_askama_utils::filters;

common_derives! {
    pub struct SessionContext {
        pub title: Option<String>,
        pub date: Option<String>,
        pub raw_content: Option<String>,
        pub enhanced_content: Option<String>,
        pub meeting_chat: Option<String>,
        pub transcript: Option<Transcript>,
        pub participants: Vec<Participant>,
        pub event: Option<Event>,
    }
}

common_derives! {
    #[derive(askama::Template)]
    #[template(path = "chat.system.md.jinja")]
    pub struct ChatSystem {
        pub language: Option<String>,
    }
}

common_derives! {
    #[derive(askama::Template)]
    #[template(path = "context.block.md.jinja")]
    pub struct ContextBlock {
        pub contexts: Vec<SessionContext>,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use anlg_askama_utils::tpl_snapshot_with_assert;

    tpl_snapshot_with_assert!(
        test_context_block_wrapped,
        ContextBlock {
            contexts: vec![SessionContext {
                title: Some("Q1 Planning".to_string()),
                date: Some("2025-03-01".to_string()),
                raw_content: None,
                enhanced_content: Some("Summary of Q1 goals.".to_string()),
                meeting_chat: Some(
                    "- Slack · 10:42 AM · Ada · received\n  Review the rollout plan."
                        .to_string(),
                ),
                transcript: None,
                participants: vec![],
                event: None,
            }],
        },
        |v| v.starts_with("<context>") && v.trim_end().ends_with("</context>"),
        @r#"
    <context>

    Title: Q1 Planning

    Date: 2025-03-01

    Enhanced Meeting Summary:
    Summary of Q1 goals.

    Meeting Chat:
    - Slack · 10:42 AM · Ada · received
      Review the rollout plan.
    </context>
    "#);
}
