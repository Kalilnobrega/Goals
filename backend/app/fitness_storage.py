import hashlib
import hmac
import os
import time
from functools import lru_cache
from pathlib import Path

DEFAULT_DIR = Path(__file__).resolve().parent.parent / "media"
URL_LIFETIME = 6 * 3600
MAX_BYTES = 8 * 1024 * 1024
SIGNATURES = {
    "image/jpeg": lambda data: data[:3] == b"\xff\xd8\xff",
    "image/png": lambda data: data[:8] == b"\x89PNG\r\n\x1a\n",
    "image/webp": lambda data: data[:4] == b"RIFF" and data[8:12] == b"WEBP",
}
EXTENSIONS = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


def sniff(data: bytes) -> str | None:
    return next((kind for kind, check in SIGNATURES.items() if check(data)), None)


class LocalStorage:
    def __init__(self, root: Path):
        self.root = root

    def path(self, key: str) -> Path:
        return self.root / key

    def save(self, key: str, data: bytes, content_type: str) -> None:
        target = self.path(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)

    def read(self, key: str) -> bytes | None:
        target = self.path(key)
        return target.read_bytes() if target.exists() else None

    def delete(self, key: str) -> None:
        self.path(key).unlink(missing_ok=True)


class BucketStorage:
    def __init__(self, bucket: str, endpoint: str | None, region: str | None, key_id: str, secret: str):
        import boto3

        self.bucket = bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=endpoint or None,
            region_name=region or "auto",
            aws_access_key_id=key_id,
            aws_secret_access_key=secret,
        )

    def save(self, key: str, data: bytes, content_type: str) -> None:
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)

    def read(self, key: str) -> bytes | None:
        try:
            return self.client.get_object(Bucket=self.bucket, Key=key)["Body"].read()
        except self.client.exceptions.NoSuchKey:
            return None

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)


@lru_cache(maxsize=1)
def bucket_storage(bucket: str, endpoint: str, region: str, key_id: str, secret: str) -> BucketStorage:
    return BucketStorage(bucket, endpoint, region, key_id, secret)


def get_storage():
    bucket = os.getenv("MEDIA_BUCKET")
    if bucket:
        return bucket_storage(
            bucket,
            os.getenv("MEDIA_ENDPOINT", ""),
            os.getenv("MEDIA_REGION", ""),
            os.getenv("MEDIA_ACCESS_KEY_ID", ""),
            os.getenv("MEDIA_SECRET_ACCESS_KEY", ""),
        )
    return LocalStorage(Path(os.getenv("FITNESS_MEDIA_DIR") or DEFAULT_DIR))


def secret() -> bytes:
    from app.main import SECRET_KEY

    return SECRET_KEY.encode()


def signature(media_id: int, variant: str, expires: int) -> str:
    return hmac.new(secret(), f"media:{media_id}:{variant}:{expires}".encode(), hashlib.sha256).hexdigest()[:32]


def media_url(media_id: int, variant: str = "feed") -> str:
    expires = (int(time.time()) // 3600 + 1) * 3600 + URL_LIFETIME
    return f"/fitness/media/{media_id}?v={variant}&exp={expires}&sig={signature(media_id, variant, expires)}"


def valid_signature(media_id: int, variant: str, expires: int, sig: str) -> bool:
    return expires >= time.time() and hmac.compare_digest(signature(media_id, variant, expires), sig)
