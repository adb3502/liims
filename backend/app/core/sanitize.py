"""Input sanitization utilities.

Provides HTML entity escaping for user-provided text fields
to prevent XSS when values are rendered in the UI.
"""

import html
import re


def sanitize_text(value: str) -> str:
    """Escape HTML entities in a text string.

    Converts characters like <, >, &, ", ' into their HTML entity equivalents
    so they render as literal text rather than being interpreted as HTML/JS.
    """
    if not value:
        return value
    return html.escape(value, quote=True)


def sanitize_dict_values(data: dict, fields: list[str] | None = None) -> dict:
    """Sanitize string values in a dictionary.

    Args:
        data: Dictionary of values.
        fields: If provided, only sanitize these keys. Otherwise sanitize
                all string values.
    """
    result = dict(data)
    for key, value in result.items():
        if isinstance(value, str):
            if fields is None or key in fields:
                result[key] = sanitize_text(value)
    return result


def strip_control_chars(value: str) -> str:
    """Remove non-printable control characters (except newline, tab)."""
    if not value:
        return value
    return re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", value)


def sanitize_filename(filename: str) -> str:
    """Sanitize a filename to prevent path traversal.

    Strips directory components and replaces dangerous characters.
    """
    if not filename:
        return "unnamed"
    # Remove any directory components
    name = filename.replace("\\", "/").split("/")[-1]
    # Remove null bytes and control characters
    name = strip_control_chars(name)
    # Replace characters that are problematic in file paths
    name = re.sub(r'[<>:"|?*]', "_", name)
    # Remove leading dots (hidden files / directory traversal)
    name = name.lstrip(".")
    return name or "unnamed"
