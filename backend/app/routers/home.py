from fastapi import APIRouter

home_router = APIRouter(tags=["home"])


@home_router.get("/")
def health_check():
    return {"status": "ok"}
