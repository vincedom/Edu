from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.core.auth import AuthUser

router = APIRouter()


@router.get("/me")
async def read_current_user(user: AuthUser = Depends(get_current_user)) -> dict:
    return {
        "sub": user.sub,
        "email": user.email,
        "name": user.name,
        "roles": list(user.roles),
    }
