const COMMANDS: &[&str] = &[
    "summary_length_policy",
    "prepare_generated_summary",
    "compose_generated_summary",
    "render",
    "render_custom",
    "render_support",
    "get_template_source",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
