'use client';
import { usePathname } from 'next/navigation';
import Navbar from './Navbar';

const ROUTES_WITHOUT_NAVBAR = ['/login', '/register', '/forgot-password', '/verify-email'];

export default function AppNavbar() {
  const pathname = usePathname();
  const hidden = ROUTES_WITHOUT_NAVBAR.some(route => pathname === route || pathname.startsWith(`${route}/`));
  return hidden ? null : <Navbar />;
}
