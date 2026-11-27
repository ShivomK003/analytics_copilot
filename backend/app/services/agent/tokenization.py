import tiktoken
from functools import lru_cache


@lru_cache(maxsize=None)
def get_tokenizer(
    encoding_name: str
) -> tiktoken.Encoding:

    return tiktoken.get_encoding(encoding_name)
    
    

def count_tokens(
    text: str,
    encoding_name: str
) -> int:

    return len(get_tokenizer(encoding_name).encode_ordinary(text))