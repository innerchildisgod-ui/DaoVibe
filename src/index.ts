import { LanguageEngine } from "./engine";
import {
  MeaningProposalPayload,
  MeaningVotePayload,
  PhraseObservedPayload,
} from "./protocol/packetTypes";

const zone = "chennai_local_zone";

const engine = new LanguageEngine({
  zone,
  author: "dev_public_key_001",
  nodeAgeGroup: "adult",
});

engine.addNode({
  node_id: "node_laptop_001",
  public_key: "dev_public_key_laptop_001",
  zone,
  roles: ["laptop_worker", "validator", "zone_index"],
  age_group: "adult",
  trusted_score: 0.92,
  online: true,
  supported_languages: ["Tamil", "Tamil-English slang", "English"],
  supported_regions: ["Chennai"],
  current_load: 0.2,
  last_seen: Math.floor(Date.now() / 1000),
});

engine.addNode({
  node_id: "node_phone_child_001",
  public_key: "dev_public_key_phone_child_001",
  zone,
  roles: ["phone_active"],
  age_group: "child",
  trusted_score: 0.4,
  online: true,
  supported_languages: ["Tamil-English slang"],
  supported_regions: ["Chennai"],
  current_load: 0.3,
  last_seen: Math.floor(Date.now() / 1000),
});

engine.addNode({
  node_id: "node_phone_adult_001",
  public_key: "dev_public_key_phone_adult_001",
  zone,
  roles: ["phone_active"],
  age_group: "adult",
  trusted_score: 0.71,
  online: true,
  supported_languages: ["Tamil-English slang"],
  supported_regions: ["Chennai"],
  current_load: 0.4,
  last_seen: Math.floor(Date.now() / 1000),
});

const phrasePayload: PhraseObservedPayload = {
  phrase_id: "phrase_scene_ah",
  surface_text: "scene ah?",
  phonetic_hint: "siin-aa",
  language_hint: "Tamil-English slang",
  input_type: "speech",
};

const phraseResult = engine.observePhrase(phrasePayload);

console.log("Phrase result:");
console.dir(
  {
  packet_type: phraseResult.packet.packet_type,
  packetSize: phraseResult.packetSize,
  packetRoute: phraseResult.packetRoute,
  nodeRoute: {
      decision: phraseResult.nodeRoute.decision,
      targets: phraseResult.nodeRoute.targets.map((node) => node.node_id),
      reason: phraseResult.nodeRoute.reason,
    },
  },
  { depth: null }
);

const meaningPayload: MeaningProposalPayload = {
  phrase_id: "phrase_scene_ah",
  meaning_id: "meaning_what_happened",
  reference_meaning: "What happened?",
  context: "Used casually after an event or problem.",
  confidence: 0.62,
};

const meaningResult = engine.proposeMeaning(
  meaningPayload,
  phraseResult.packet.packet_id
);

console.log("\nMeaning result:");
console.dir(
  {
  packet_type: meaningResult.packet.packet_type,
  packetSize: meaningResult.packetSize,
  packetRoute: meaningResult.packetRoute,
  nodeRoute: {
      decision: meaningResult.nodeRoute.decision,
      targets: meaningResult.nodeRoute.targets.map((node) => node.node_id),
      reason: meaningResult.nodeRoute.reason,
    },
  },
  { depth: null }
);

const votePayload: MeaningVotePayload = {
  phrase_id: "phrase_scene_ah",
  meaning_id: "meaning_what_happened",
  vote: "confirm",
  confidence: 0.9,
};

const voteResult = engine.voteMeaning(
  votePayload,
  meaningResult.packet.packet_id
);

console.log("\nVote result:");
console.dir(
  {
  packet_type: voteResult.packet.packet_type,
  packetSize: voteResult.packetSize,
  packetRoute: voteResult.packetRoute,
  nodeRoute: {
      decision: voteResult.nodeRoute.decision,
      targets: voteResult.nodeRoute.targets.map((node) => node.node_id),
      reason: voteResult.nodeRoute.reason,
    },
  },
  { depth: null }
);

console.log("\nLocal Knowledge Store:");
console.dir(engine.listKnowledge(), { depth: null });

console.log("\nPacket Count:", engine.packetCount());

console.log(
  "Packets linked to phrase_scene_ah:",
  engine.findPacketsByPhrase("phrase_scene_ah").map((item) => ({
    packet_id: item.packet.packet_id,
    packet_type: item.packet.packet_type,
  }))
);

console.log(
  "\nAll known nodes:",
  engine.listNodes().map((node) => ({
    node_id: node.node_id,
    roles: node.roles,
    trusted_score: node.trusted_score,
    online: node.online,
  }))
);