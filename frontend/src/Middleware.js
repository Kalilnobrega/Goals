import { NextResponse } from 'next/server';

// Rotas públicas que NÃO precisam de autenticação
const PUBLIC_ROUTES = ['/login', '/register', '/forgot-password'];

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Libera rotas públicas
  const isPublic = PUBLIC_ROUTES.some(r => pathname.startsWith(r));
  if (isPublic) return NextResponse.next();

  // Verifica o token no cookie (alternativa ao localStorage para SSR)
  const token = request.cookies.get('token')?.value;

  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.svg).*)',
  ],
};