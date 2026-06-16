from __future__ import annotations

import random
import string

RANDOM_CODE_LENGTH = 12


def _random_code(length: int = RANDOM_CODE_LENGTH) -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=length))


def _id(prefix: str) -> str:
    return f"{prefix}-{_random_code()}"


def new_token_usage_id() -> str:
    return _id("ATU")


def new_design_project_id() -> str:
    return _id("DPRJ")


def new_document_id() -> str:
    return _id("DOC")


def new_upload_id() -> str:
    return _id("UP")


def new_job_id() -> str:
    return _id("JOB")


def new_section_id() -> str:
    return _id("SEC")
