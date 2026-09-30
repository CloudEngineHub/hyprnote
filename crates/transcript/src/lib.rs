mod batch_refine;
mod channel_state;
mod label;
mod postprocessor;
mod processor;
mod render;
mod segments;
mod speaker_context;
pub use speaker_context::{
    ProvisionalSpeakerLabel, SpeakerContext, SpeakerContextInterval, SpeakerResolutionReason,
    segment_options_for_assignments,
};
mod types;
mod words;

pub use batch_refine::{
    BatchRefinementOutcome, BatchRefinementRequest, BatchRefinementSource,
    BatchTranscriptPromotion, SpeakerClusterReconciliationRequest, StoredSpeakerHint,
    StoredTranscriptWord, reconcile_refined_speaker_clusters, refine_batch_transcript,
};
pub use label::{SpeakerLabelContext, SpeakerLabeler, render_speaker_label};
pub use postprocessor::{
    TranscriptPostprocessor, TranscriptPostprocessorError, TranscriptPostprocessorRequest,
    TranscriptPostprocessorResult,
};
pub use processor::TranscriptProcessor;
pub use render::{
    RenderTranscriptHuman, RenderTranscriptInput, RenderTranscriptRequest,
    RenderTranscriptWordInput, RenderedTranscriptSegment, normalize_rendered_segment_words,
    render_transcript_segments, stable_segment_id,
};
pub use segments::build_segments;
pub use types::{
    ChannelProfile, FinalizedWord, IdentityAssignment, IdentityScope, PartialWord, RawWord,
    Segment, SegmentBuilderOptions, SegmentKey, SegmentWord, TranscriptDelta, WordState,
    channel_assignments_for_participants, segment_options_for_participants,
};
