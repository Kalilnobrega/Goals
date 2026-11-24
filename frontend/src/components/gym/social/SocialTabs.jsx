'use client';
import { Newspaper, Trophy, Users } from 'lucide-react';
import SegmentTabs from '../SegmentTabs';

const SOCIAL_TABS = [
  { href: '/gym/social', label: 'Feed', icon: Newspaper },
  { href: '/gym/social/desafios', label: 'Desafios', icon: Trophy },
  { href: '/gym/social/amigos', label: 'Amigos', icon: Users },
];

export default function SocialTabs() {
  return <SegmentTabs tabs={SOCIAL_TABS} label="Social" />;
}
