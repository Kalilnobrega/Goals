from pydantic import BaseModel, EmailStr


class UserSchema(BaseModel):
    name: str
    email: EmailStr
    password: str

    class Config:
        from_attributes = True


class LoginSchema(BaseModel):
    email: EmailStr
    password: str

    class Config:
        from_attributes = True


class TokenSchema(BaseModel):
    refresh_token: str

    class Config:
        from_attributes = True