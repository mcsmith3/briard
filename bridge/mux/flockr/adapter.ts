import { createHerdrFamilyFactory } from "../herdr/adapter.ts";
import { FLOCKR_PROFILE } from "../herdr/profile.ts";

export const FLOCKR_MUX = "flockr";
export const flockrMuxFactory = createHerdrFamilyFactory(FLOCKR_PROFILE);
