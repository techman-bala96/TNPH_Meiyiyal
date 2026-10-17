"""Verifies Supabase access tokens: asymmetric (ES256/RS256 via the project's JWKS) or legacy HS256 (SUPABASE_JWT_SECRET)."""
from __future__ import annotations

import os
from functools import lru_cache

import jwt
from fastapi import Header, HTTPException


@lru_cache(maxsize=1)
def _jwks() -> jwt.PyJWKClient | None:
    url = os.environ.get("SUPABASE_URL")
    return jwt.PyJWKClient(url.rstrip("/") + "/auth/v1/.well-known/jwks.json", cache_keys=True, lifespan=600) if url else None


def verify_token(token: str) -> dict:
    try:
        alg = jwt.get_unverified_header(token).get("alg")
        opts = {"require": ["exp", "sub"]}
        if alg == "HS256":
            secret = os.environ.get("SUPABASE_JWT_SECRET")
            if not secret:
                raise HTTPException(401, "HS256 tokens not accepted")
            return jwt.decode(token, secret, algorithms=["HS256"], audience="authenticated", options=opts)
        client = _jwks()
        if client is None:
            raise HTTPException(500, "SUPABASE_URL not configured")
        key = client.get_signing_key_from_jwt(token).key
        return jwt.decode(token, key, algorithms=["ES256", "RS256"], audience="authenticated", options=opts)
    except HTTPException:
        raise
    except jwt.PyJWTError as e:
        raise HTTPException(401, f"invalid token: {e.__class__.__name__}") from e


def current_user(authorization: str = Header(default="")) -> dict:
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "missing bearer token")
    claims = verify_token(authorization.split(" ", 1)[1])
    if claims.get("role") != "authenticated":
        raise HTTPException(403, "sign in required")
    return claims
