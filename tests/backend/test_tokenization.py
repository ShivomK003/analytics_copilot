
from unittest.mock import patch

import pytest
import tiktoken

from backend.app.services.agent.tokenization import count_tokens, get_tokenizer


ENCODING_NAME = "o200k_harmony"


@pytest.fixture(autouse=True)
def clear_tokenizer_cache():
    get_tokenizer.cache_clear()
    yield
    get_tokenizer.cache_clear()


# ----------------------------------------
# Tokenizer loading and caching
# ----------------------------------------


def test_get_tokenizer_returns_encoding():
    tokenizer = get_tokenizer(ENCODING_NAME)

    assert isinstance(tokenizer, tiktoken.Encoding)


def test_get_tokenizer_correct_encoding():
    tokenizer = get_tokenizer(ENCODING_NAME)

    assert tokenizer.name == ENCODING_NAME


def test_get_tokenizer_caches_encoding():
    with patch(
        "backend.app.services.agent.tokenization.tiktoken.get_encoding",
        wraps=tiktoken.get_encoding,
    ) as mock_get_encoding:
        first = get_tokenizer(ENCODING_NAME)
        second = get_tokenizer(ENCODING_NAME)

        assert first is second
        mock_get_encoding.assert_called_once_with(ENCODING_NAME)


def test_different_encodings_cached_separately():
    first = get_tokenizer("o200k_harmony")
    second = get_tokenizer("cl100k_base")

    assert first is not second
    assert first.name == "o200k_harmony"
    assert second.name == "cl100k_base"


def test_invalid_encoding_raises_error():
    with pytest.raises(ValueError):
        get_tokenizer("nonexistent_encoding")


# ----------------------------------------
# Token counting
# ----------------------------------------


def test_empty_string_has_zero_tokens():
    assert count_tokens("", ENCODING_NAME) == 0


def test_known_token_count():
    text = "Diffusion policies for robotic manipulation"

    assert count_tokens(text, ENCODING_NAME) == 6


def test_token_count_is_integer():
    result = count_tokens("Research evidence", ENCODING_NAME)

    assert isinstance(result, int)


def test_whitespace_has_tokens():
    assert count_tokens(" ", ENCODING_NAME) > 0


@pytest.mark.parametrize(
    "text",
    [
        "Hello world",
        "Diffusion policies for robotic manipulation",
        "Machine learning\n\nDeep learning",
        "研究と人工知能",
        "π ≈ 3.14159",
        "Research 🚀",
        "   ",
        "Abstract: The model achieved 59.0% accuracy.",
        r"$\frac{1}{k+r}$",
    ],
)
def test_count_matches_tokenizer(text):
    tokenizer = tiktoken.get_encoding(ENCODING_NAME)

    expected = len(tokenizer.encode_ordinary(text))

    assert count_tokens(text, ENCODING_NAME) == expected


def test_special_tokens_treated_as_ordinary_text():
    tokenizer = get_tokenizer(ENCODING_NAME)
    text = next(iter(tokenizer.special_tokens_set))

    expected = len(tokenizer.encode_ordinary(text))

    assert count_tokens(text, ENCODING_NAME) == expected


def test_different_encoding_supported():
    text = "Diffusion policies for robotic manipulation"
    encoding_name = "cl100k_base"

    expected = len(
        tiktoken.get_encoding(encoding_name).encode_ordinary(text)
    )

    assert count_tokens(text, encoding_name) == expected


def test_count_tokens_reuses_cached_tokenizer():
    with patch(
        "backend.app.services.agent.tokenization.tiktoken.get_encoding",
        wraps=tiktoken.get_encoding,
    ) as mock_get_encoding:
        count_tokens("First abstract", ENCODING_NAME)
        count_tokens("Second abstract", ENCODING_NAME)
        count_tokens("Third abstract", ENCODING_NAME)

        mock_get_encoding.assert_called_once_with(ENCODING_NAME)


def test_invalid_encoding_in_count_tokens():
    with pytest.raises(ValueError):
        count_tokens("Research", "nonexistent_encoding")
