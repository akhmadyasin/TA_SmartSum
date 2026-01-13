# auth_utils.py
import os, jwt
from functools import wraps
from flask import request, g, abort
from jwt import PyJWKClient

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
JWKS_URL = os.getenv("SUPABASE_JWKS_URL", f"{SUPABASE_URL}/auth/v1/keys")
ISSUER = f"{SUPABASE_URL}/auth/v1"

_jwks = PyJWKClient(JWKS_URL)

def verify_supabase_jwt(token: str):
    key = _jwks.get_signing_key_from_jwt(token).key
    payload = jwt.decode(
        token,
        key,
        algorithms=["RS256"],
        audience="authenticated",     # aud default Supabase
        issuer=ISSUER,
        options={"require": ["exp", "iat"]},
    )
    return payload  # berisi sub (user id), email, dll.

def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        # Ambil dari header Authorization: Bearer ...
        auth = request.headers.get("Authorization", "")
        token = auth.split(" ", 1)[1].strip() if auth.startswith("Bearer ") else None
        # fallback: query/body (kalau mau)
        if not token:
            token = request.args.get("token") or (request.json or {}).get("token")
        if not token:
            abort(401)

        try:
            g.user = verify_supabase_jwt(token)
        except Exception:
            abort(401)

        return fn(*args, **kwargs)
    return wrapper
