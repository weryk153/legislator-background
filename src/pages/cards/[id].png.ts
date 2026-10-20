import type { APIRoute } from 'astro';
import { districtCardId, hasPortraitContent, loadShareCards, type ShareCardData } from '../../lib/shareCardData';
import { renderPortraitCard } from '../../lib/renderPortraitCard';
import { loadDistrictPages, type DistrictPageData } from '../../lib/districtPageData';
import { renderDistrictCard } from '../../lib/renderDistrictCard';
import { loadDistrictCardProfiles } from '../../lib/districtCardProfiles';

export async function getStaticPaths() {
  const people = [...(await loadShareCards()).values()]
    .filter(hasPortraitContent)
    .map(card => ({ params: { id: card.id }, props: { card } }));
  const districts = loadDistrictPages().map(page => ({
    params: { id: districtCardId(page.county.key, page.district.no) }, props: { page },
  }));
  return [...people, ...districts];
}

export const GET: APIRoute = async ({ props }) => {
  const png = props.page
    ? renderDistrictCard(props.page as DistrictPageData, await loadDistrictCardProfiles())
    : renderPortraitCard(props.card as ShareCardData);
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
