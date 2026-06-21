import { LmpPacket } from "./packet";
import { PacketType } from "./packetTypes";

export interface PacketRefs {
  phrase_id?: string;
  meaning_id?: string;
  symbol_id?: string;
}

export interface IndexedPacket {
  packet: LmpPacket;
  refs: PacketRefs;
}

function extractRefs(packet: LmpPacket): PacketRefs {
  const payload = packet.payload as Record<string, unknown>;

  return {
    phrase_id:
      typeof payload.phrase_id === "string" ? payload.phrase_id : undefined,
    meaning_id:
      typeof payload.meaning_id === "string" ? payload.meaning_id : undefined,
    symbol_id:
      typeof payload.symbol_id === "string" ? payload.symbol_id : undefined,
  };
}

function addToMapSet<TKey, TValue>(
  map: Map<TKey, Set<TValue>>,
  key: TKey | undefined,
  value: TValue
): void {
  if (key === undefined) return;

  const existing = map.get(key);

  if (existing) {
    existing.add(value);
    return;
  }

  map.set(key, new Set([value]));
}

export class PacketIndex {
  private packetsById = new Map<string, IndexedPacket>();
  private packetIdsByType = new Map<PacketType, Set<string>>();
  private packetIdsByZone = new Map<string, Set<string>>();
  private packetIdsByAuthor = new Map<string, Set<string>>();
  private packetIdsByParent = new Map<string, Set<string>>();
  private packetIdsByPhrase = new Map<string, Set<string>>();
  private packetIdsByMeaning = new Map<string, Set<string>>();
  private packetIdsBySymbol = new Map<string, Set<string>>();

  snapshot(): LmpPacket[] {
    return [...this.packetsById.values()].map((indexed) => indexed.packet);
  }

  restore(packets: LmpPacket[]): void {
    this.clear();

    for (const packet of packets) {
      this.add(packet);
    }
  }

  has(packet_id: string): boolean {
    return this.packetsById.has(packet_id);
  }

  add(packet: LmpPacket): IndexedPacket {
    if (this.has(packet.packet_id)) {
      throw new Error(`Duplicate packet: ${packet.packet_id}`);
    }

    const refs = extractRefs(packet);
    const indexed: IndexedPacket = { packet, refs };

    this.packetsById.set(packet.packet_id, indexed);

    addToMapSet(this.packetIdsByType, packet.packet_type, packet.packet_id);
    addToMapSet(this.packetIdsByZone, packet.zone, packet.packet_id);
    addToMapSet(this.packetIdsByAuthor, packet.author, packet.packet_id);
    addToMapSet(this.packetIdsByParent, packet.parent, packet.packet_id);

    addToMapSet(this.packetIdsByPhrase, refs.phrase_id, packet.packet_id);
    addToMapSet(this.packetIdsByMeaning, refs.meaning_id, packet.packet_id);
    addToMapSet(this.packetIdsBySymbol, refs.symbol_id, packet.packet_id);

    return indexed;
  }

  get(packet_id: string): IndexedPacket | undefined {
    return this.packetsById.get(packet_id);
  }

  private getMany(ids: Set<string> | undefined): IndexedPacket[] {
    if (!ids) return [];

    return [...ids]
      .map((id) => this.packetsById.get(id))
      .filter((item): item is IndexedPacket => item !== undefined);
  }

  findByType(packet_type: PacketType): IndexedPacket[] {
    return this.getMany(this.packetIdsByType.get(packet_type));
  }

  findByZone(zone: string): IndexedPacket[] {
    return this.getMany(this.packetIdsByZone.get(zone));
  }

  findByAuthor(author: string): IndexedPacket[] {
    return this.getMany(this.packetIdsByAuthor.get(author));
  }

  findByParent(parent: string): IndexedPacket[] {
    return this.getMany(this.packetIdsByParent.get(parent));
  }

  findByPhrase(phrase_id: string): IndexedPacket[] {
    return this.getMany(this.packetIdsByPhrase.get(phrase_id));
  }

  findByMeaning(meaning_id: string): IndexedPacket[] {
    return this.getMany(this.packetIdsByMeaning.get(meaning_id));
  }

  findBySymbol(symbol_id: string): IndexedPacket[] {
    return this.getMany(this.packetIdsBySymbol.get(symbol_id));
  }

  count(): number {
    return this.packetsById.size;
  }

  private clear(): void {
    this.packetsById.clear();
    this.packetIdsByType.clear();
    this.packetIdsByZone.clear();
    this.packetIdsByAuthor.clear();
    this.packetIdsByParent.clear();
    this.packetIdsByPhrase.clear();
    this.packetIdsByMeaning.clear();
    this.packetIdsBySymbol.clear();
  }
}
