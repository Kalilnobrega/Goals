from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from fastapi.security import OAuth2PasswordRequestForm
from app.models import User, RefreshToken, Streak
from app.database import get_db
from app.main import (
    bcrypt_context,
    oauth2_scheme,
    limiter,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_DAYS,
    ALGORITHM,
    SECRET_KEY,
    RESEND_KEY,
    GOOGLE_CLIENT_ID,
)
from app.schemas import (
    UserSchema,
    UserResponseSchema,
    TokenSchema,
    GoogleTokenSchema,
    ForgotPasswordSchema,
    ResetPasswordSchema,
)
from sqlalchemy.orm import Session
from jose import jwt, JWTError
from datetime import datetime, timedelta, timezone, date
from sqlalchemy import or_
import requests
import resend
import uuid

auth_router = APIRouter(prefix="/auth", tags=["auth"])

resend.api_key = RESEND_KEY


def create_token(
    id_user, expire=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES), token_type="access"
):
    expiration_date = datetime.now(timezone.utc) + expire
    dic_info = {
        "sub": str(id_user),
        "exp": expiration_date,
        "type": token_type,
        "jti": str(uuid.uuid4()),
    }
    jwt_encoded = jwt.encode(dic_info, SECRET_KEY, ALGORITHM)

    return jwt_encoded


def create_refresh_token_in_db(new_refresh_token: str, user_id: str, session: Session):
    refresh_db = RefreshToken(
        token=new_refresh_token,
        user_id=user_id,
        expires_at=datetime.now((timezone.utc))
        + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    )
    session.add(refresh_db)
    session.commit()

    return {"message": "refresh token cadastrado no banco de dados"}


def cleanup_invalid_tokens(session: Session):
    now = datetime.now(timezone.utc)

    session.query(RefreshToken).filter(
        or_(
            RefreshToken.revoked == True,
            RefreshToken.expires_at < now.replace(tzinfo=None),
        )
    ).delete()
    session.commit()


def get_current_user(
    token: str = Depends(oauth2_scheme), session: Session = Depends(get_db)
):
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
    if user.password == "google_oauth_account":
        return False
    elif not bcrypt_context.verify(password, user.password):
        return False

    return user


def send_verification_email(email_to: str, token: str):
    verify_link = f"http://localhost:3000/verify-email?token={token}"

    try:
        resend.Emails.send(
            {
                "from": "Goals App <onboarding@resend.dev>",
                "to": email_to,
                "subject": "Verifique seu e-mail no Goals!",
                "html": f"""
                <h2>Bem-vindo ao Goals!</h2>
                <p>Clique no botão abaixo para verificar sua conta e começar a bater suas metas:</p>
                <a href='{verify_link}' style='display:inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;'>Verificar E-mail</a>
                <p><small>Este link expira em 24 horas.</small></p> """,
            }
        )
    except Exception as e:
        print(f"Erro ao enviar e-mail pelo Resend: {e}")


def send_reset_email(email_to: str, token: str):
    reset_link = f"http://localhost:3000/forgot-password?token={token}"

    try:
        resend.Emails.send(
            {
                "from": "Goals App <onboarding@resend.dev>",
                "to": email_to,
                "subject": "Redefina sua senha no Goals",
                "html": f"""
                <h2>Esqueceu sua senha?</h2>
                <p>Clique no botão abaixo para escolher uma nova senha:</p>
                <a href='{reset_link}' style='display:inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;'>Redefinir senha</a>
                <p><small>Este link expira em 1 hora. Se você não solicitou isso, ignore este e-mail.</small></p> """,
            }
        )
    except Exception as e:
        print(f"Erro ao enviar e-mail pelo Resend: {e}")


@auth_router.get("/me", response_model=UserResponseSchema)
def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user


@auth_router.get("/me/streak")
def get_streak(
    current_user: User = Depends(get_current_user), session: Session = Depends(get_db)
):
    streak = session.query(Streak).filter(Streak.user_id == current_user.id).first()
    if not streak:
        return {"current_streak": 0, "longest_streak": 0, "last_activity": None}

    if streak.last_activity and streak.last_activity < date.today() - timedelta(days=1):
        streak.current_streak = 0
        streak.last_activity = None
        session.commit()

    return {
        "current_streak": streak.current_streak,
        "longest_streak": streak.longest_streak,
        "last_activity": str(streak.last_activity) if streak.last_activity else None,
    }


@auth_router.post("/register")
@limiter.limit("5/minute")
async def register(
    request: Request,
    user_schema: UserSchema,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_db),
):
    user = session.query(User).filter(User.email == user_schema.email).first()
    if user:
        raise HTTPException(status_code=400, detail="e-mail já cadastrado")

    crypt_password = bcrypt_context.hash(user_schema.password)
    new_user = User(
        name=user_schema.name,
        email=user_schema.email,
        password=crypt_password,
    )
    session.add(new_user)
    session.commit()

    verification_token = create_token(
        new_user.id, expire=timedelta(hours=24), token_type="verification"
    )

    background_tasks.add_task(
        send_verification_email, new_user.email, verification_token
    )

    return {"message": "Usúario cadastrado com sucesso! Verifique seu e-mail."}


@auth_router.post("/login")
@limiter.limit("5/minute")
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: Session = Depends(get_db),
):
    user = auth_user(form_data.username, form_data.password, session)
    if not user:
        raise HTTPException(status_code=400, detail="e-mail ou senha incorretos")

    if not user.is_verify:
        raise HTTPException(
            status_code=403,
            detail="Por favor, verifique seu e-mail antes de fazer login.",
        )

    new_access_token = create_token(user.id)
    new_refresh_token = create_token(
        user.id, timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS), "refresh"
    )

    create_refresh_token_in_db(new_refresh_token, user.id, session)

    cleanup_invalid_tokens(session)

    return {
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "token_type": "Bearer",
    }


@auth_router.post("/google")
def google_auth(
    google_token_schema: GoogleTokenSchema, session: Session = Depends(get_db)
):
    token = google_token_schema.token
    try:
        tokeninfo_response = requests.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"access_token": token},
            timeout=5,
        )

        if tokeninfo_response.status_code != 200:
            raise ValueError("Token inválido")

        tokeninfo = tokeninfo_response.json()

        if tokeninfo.get("aud") != GOOGLE_CLIENT_ID:
            raise ValueError("Token não pertence a este aplicativo")

        google_response = requests.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            params={"access_token": token},
            timeout=5,
        )

        if google_response.status_code != 200:
            raise ValueError("Token inválido")

        idinfo = google_response.json()
        user_email = idinfo["email"]
        user_name = idinfo.get("name", "Usuário")

        user = session.query(User).filter(User.email == user_email).first()

        if not user:
            user = User(
                email=user_email,
                name=user_name,
                password="google_oauth_account",
                is_verify=True,
            )

            session.add(user)
            session.commit()
            session.refresh(user)

        new_access_token = create_token(user.id)
        new_refresh_token = create_token(
            user.id, timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS), "refresh"
        )

        create_refresh_token_in_db(new_refresh_token, user.id, session)

        cleanup_invalid_tokens(session)

        return {
            "access_token": new_access_token,
            "refresh_token": new_refresh_token,
            "token_type": "Bearer",
        }

    except (ValueError, KeyError):
        raise HTTPException(status_code=401, detail="Token do Google inválido")
    except requests.RequestException:
        raise HTTPException(
            status_code=502, detail="Não foi possível validar o token com o Google"
        )


@auth_router.post("/forgot-password")
async def forgot_password(
    payload: ForgotPasswordSchema,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_db),
):
    user = session.query(User).filter(User.email == payload.email).first()

    if user:
        reset_token = create_token(
            user.id, expire=timedelta(hours=1), token_type="reset"
        )
        background_tasks.add_task(send_reset_email, user.email, reset_token)

    return {
        "message": "Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha."
    }


@auth_router.post("/reset-password")
async def reset_password(
    payload: ResetPasswordSchema, session: Session = Depends(get_db)
):
    try:
        token_payload = jwt.decode(payload.token, SECRET_KEY, algorithms=[ALGORITHM])

        if token_payload.get("type") != "reset":
            raise HTTPException(
                status_code=400, detail="Token de redefinição inválido"
            )

        user_id = token_payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=400, detail="Token inválido")

        user = session.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="Usuário não encontrado")

        user.password = bcrypt_context.hash(payload.new_password)
        session.query(RefreshToken).filter(RefreshToken.user_id == user.id).update(
            {"revoked": True}
        )
        session.commit()

        return {"message": "Senha redefinida com sucesso!"}

    except JWTError:
        raise HTTPException(
            status_code=400, detail="Token de redefinição expirado ou inválido"
        )


@auth_router.post("/verify-email")
async def verify_email(token: str, session: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

        if payload.get("type") != "verification":
            raise HTTPException(status_code=400, detail="Token de verificação inválido")

        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=400, detail="Token inválido")

        user = session.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="Usuário não encontrado")

        if user.is_verify:
            return {"message": "E-mail já estava verificado!"}

        user.is_verify = True
        session.commit()

        return {"message": "E-mail verificado com sucesso!"}

    except JWTError:
        raise HTTPException(
            status_code=400, detail="Token de verificação expirado ou inválido"
        )


@auth_router.post("/logout")
async def logout(token_schema: TokenSchema, session: Session = Depends(get_db)):
    token = (
        session.query(RefreshToken)
        .filter(RefreshToken.token == token_schema.refresh_token)
        .first()
    )
    if token:
        token.revoked = True
        session.commit()

    return {"message": "logout realizado"}


@auth_router.post("/refresh")
async def refresh(token_schema: TokenSchema, session: Session = Depends(get_db)):
    token_db = (
        session.query(RefreshToken)
        .filter(RefreshToken.token == token_schema.refresh_token)
        .first()
    )
    if not token_db or token_db.revoked:
        raise HTTPException(status_code=401, detail="Token inválido")
    if token_db.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Token inválido")

    try:
        payload = jwt.decode(
            token_schema.refresh_token, SECRET_KEY, algorithms=[ALGORITHM]
        )
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Token inválido")
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Token inválido")
        token_db.revoked = True
        session.commit()

        new_access_token = create_token(user_id)
        new_refresh_token = create_token(
            user_id, timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS), "refresh"
        )

        create_refresh_token_in_db(new_refresh_token, user_id, session)

        return {
            "access_token": new_access_token,
            "refresh_token": new_refresh_token,
            "token_type": "Bearer",
        }
    except JWTError:
        raise HTTPException(status_code=401, detail="Refresh token inválido")
