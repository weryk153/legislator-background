-- Wikipedia as a labelled source type for 首長 career history (no official career-history source exists for mayors/magistrates).
alter type source_type add value if not exists 'wiki';
