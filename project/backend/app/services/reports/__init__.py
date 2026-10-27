"""PDF and Excel report builders for Package E (EaseAnalytics and EaseGuide audit exports).

Pure functions: they take plain dicts and return file bytes, so they are easy to unit-test without a database.
"""

MEDIA_TYPES = {
    "pdf": "application/pdf",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}
EXPORT_RESPONSES = {200: {"description": "The report file (download)",
                          "content": {media: {"schema": {"type": "string", "format": "binary"}}
                                      for media in MEDIA_TYPES.values()}}}


def attachment_headers(filename: str) -> dict[str, str]:
    return {"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"}
