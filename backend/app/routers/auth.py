from fastapi import APIRouter, Depends, HTTPException
from app.models import User, RefreshToken
from app.database import get_db
from app.main import bcrypt_context, oauth2_scheme, ACCESS_TOKEN_EXPIRE_MINUTES, REFRESH_TOKEN_EXPIRE_DAYS, ALGORITHM, SECRET_KEY
from app.schemas import UserSchema, LoginSchema, TokenSchema
from sqlalchemy.orm import Session
from jose import jwt, JWTError
from datetime import datetime, timedelta, timezone

auth_router = APIRouter(prefix='/auth', tags=['auth'])

def create_token(id_user, expire = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES), token_type = 'access'):

    expiration_date = datetime.now(timezone.utc) + expire  
    dic_info = {'sub': str(id_user), 'exp': expiration_date, 'type': token_type}
    jwt_encoded = jwt.encode(dic_info, SECRET_KEY, ALGORITHM)
    return jwt_encoded

def get_current_user(token: str = Depends(oauth2_scheme), session: Session = Depends(get_db)):

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401)       
        user_id = payload.get("sub")   
        if user_id is None:
            raise HTTPException(status_code=401)
        user = session.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=401)
        return user
    except JWTError:
        raise HTTPException(status_code=401)


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
        return {'message': 'Usúario cadastrado com sucesso'}
    
@auth_router.post('/login')
async def login(login_schema: LoginSchema, session: Session = Depends(get_db)):
    user = auth_user(login_schema.email, login_schema.password, session)
    if not user:
        raise HTTPException(status_code=400, detail='e-mail ou senha incorretos')
    else:
        access_token = create_token(user.id)
        refresh_token = create_token(user.id, timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS), 'refresh')
        refresh_db = RefreshToken(
        token=refresh_token,
        user_id=user.id,
        expires_at=datetime.now((timezone.utc)) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        )
        session.add(refresh_db)
        session.commit()
        return {
            'access_token': access_token,
            'refresh_token': refresh_token,
            'token_type': 'Bearer'
        }

@auth_router.post("/logout")
async def logout(token_schema: TokenSchema, session: Session = Depends(get_db)):
    token = session.query(RefreshToken).filter(RefreshToken.token == token_schema).first()
    if token:
        token.revoked = True
        session.commit()
    return {"message": "logout realizado"}
        
@auth_router.post('/refresh')
async def refresh(token_schema: TokenSchema, session: Session = Depends(get_db)):
    token_db = session.query(RefreshToken).filter(RefreshToken.token == token_schema).first()
    if not token_db or token_db.revoked:
        raise HTTPException(status_code=401, detail="Token inválido")
    if token_db.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Token inválido")
    try:
        payload = jwt.decode(token_schema, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Token inválido")
        user_id = payload.get('sub')
        if user_id is None:
            raise HTTPException(status_code=401, detail="Token inválido")
        token_db.revoked = True
        session.commit()
        new_access_token = create_token(user_id)
        new_refresh_token = create_token(user_id, timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS), 'refresh')
        refresh_db = RefreshToken(
        token=new_refresh_token,
        user_id=user_id,
        expires_at=datetime.now((timezone.utc)) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        )
        session.add(refresh_db)
        session.commit()
        return {
            'access_token': new_access_token,
            'refresh_token': new_refresh_token
        }
    except JWTError:
         raise HTTPException(status_code=401, detail="Refresh token inválido")