"""Database availability errors shared by acquisition and HTTP handling."""


class DatabasePoolTimeout(TimeoutError):
    """No pooled connection capacity became available within the wait limit."""
