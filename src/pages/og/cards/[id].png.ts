import type { APIRoute } from 'astro';
import { loadShareCards, type ShareCardData } from '../../../lib/shareCardData';
import { renderShareCard } from '../../../lib/renderShareCard';

export async function getStaticPaths() {
  return [...(await loadShareCards()).values()].map(card => ({ params: { id: card.id }, props: { card } }));
}

export const GET: APIRoute = ({ props }) => {
  const png = renderShareCard(props.card as ShareCardData);
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
