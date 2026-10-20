import candidates from '../_data/reaction-targets.json';
import { createReactionHandler } from '../../server/reactions';

export const onRequest = createReactionHandler(candidates);
