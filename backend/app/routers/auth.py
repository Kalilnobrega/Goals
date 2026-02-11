from fastapi import APIRouter, Depends, HTTPException
from ..models import User
from ..database import get_db
from ..main import bcrypt_context
from ..schemas import UserSchema
from sqlalchemy.orm import Session

auth_router = APIRouter(prefix='/auth', tags=['auth'])

@auth_router.post('/register')
async def register(user_schema: UserSchema, session: Session = Depends(get_db) ):
    user = session.query(User).filter(User.email == user_schema.email).first()
    if user:
        raise HTTPException(status_code=400, detail='e-mail já cadastrado')
    else:
        crypt_password = bcrypt_context.hash(user_schema.password)
        new_user = User(name=user_schema.name, email=user_schema.email, password=crypt_password)
        session.add(new_user)
        session.commit()
        return {'message: Usúario cadastrado com sucesso'}
