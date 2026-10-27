"""Size limits for organiser venue layouts, shared by the database models and the upload parser."""

SECTION_NAME_MAX = 100
ROW_LABEL_MAX = 20

# An event seat label is "<section> <row>-<number>", so it must fit the longest section and row names.
EVENT_SEAT_LABEL_MAX = SECTION_NAME_MAX + ROW_LABEL_MAX + 20
