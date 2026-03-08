from fastapi import APIRouter, Depends, HTTPException
from app.models import User
from app.database import get_db
from app.main import bcrypt_context, ACCESS_TOKEN_EXPIRE_MINUTES, ALGORITHM, SECRET_KEY
from app.schemas import UserSchema, LoginSchema
from sqlalchemy.orm import Session
from jose import jwt, JWTError
from datetime import datetime, timedelta, timezone

auth_router = APIRouter(prefix='/auth', tags=['auth'])

def create_token(id_user):
    expiration_date = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)  
    dic_info = {'sub': id_user, 'exp': expiration_date}
    jwt_encoded = jwt.encode(dic_info, SECRET_KEY, ALGORITHM)
    return jwt_encoded

def auth_user(email, password, session):
    user = session.query(User).filter(User.email == email).first()
    if not user:
        return False
    elif not bcrypt_context.verify(password, user.password):
        return False
    return user

@auth_router.post('/register')
async def register(user_schema: UserSchema, session: Session = Depends(get_db)):
    user = session.query(User).filter(User.email == user_schema.email).first()
    if user:
        raise HTTPException(status_code=400, detail='e-mail já cadastrado')
    else:
        crypt_password = bcrypt_context.hash(user_schema.password)
        new_user = User(name=user_schema.name, email=user_schema.email, password=crypt_password)
        session.add(new_user)
        session.commit()
        return {'message: Usúario cadastrado com sucesso'}
    
@auth_router.post('/login')
async def login(login_schema: LoginSchema, session: Session = Depends(get_db)):
    user = auth_user(login_schema.email, login_schema.password, session)
    if not user:
        raise HTTPException(status_code=400, detail='e-mail ou senha incorretos')
    else:
        access_token = create_token(user.id)
        return {
            'access_token': access_token,
            'token_type': 'Bearer'
        }
        
    