'use client';
import SegmentTabs from '../SegmentTabs';

const SOCIAL_TABS = [
  { href: '/gym/social', label: 'Feed' },
  { href: '/gym/social/desafios', label: 'Desafios' },
  { href: '/gym/social/amigos', label: 'Amigos' },
];

export default function SocialTabs() {
  return <SegmentTabs tabs={SOCIAL_TABS} label="Social" />;
}
