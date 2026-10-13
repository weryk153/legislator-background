import type { APIRoute } from 'astro';
import { rosterDataset, electionsDataset, marginsDataset, connectionsDataset } from '../../../../lib/clientDatasets';
export async function getStaticPaths() {
  return [await rosterDataset(), electionsDataset(), await marginsDataset(), await connectionsDataset()].map(dataset => ({
    params: { name: dataset.name, version: dataset.version }, props: { json: dataset.json },
  }));
}
export const GET: APIRoute = ({ props }) => new Response(props.json, {
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});
