import type { LanguageEngine } from "../engine";
import type {
  LocalKycVerifierAlias,
  LocalKycVerifierAliasInput,
  SQLiteStore,
} from "../storage/sqliteStore";
import { getKycClaimSummary } from "./KycLookup";

type KycLocalNodeStore = Pick<
  SQLiteStore,
  | "getOrCreateLocalKycVerifierAlias"
  | "getLocalKycVerifierAliasByNodeId"
  | "listLocalKycVerifierAliases"
>;

export class KycController {
  constructor(private readonly engine: LanguageEngine) {}

  getOrCreateLocalKycVerifierAlias(
    input: LocalKycVerifierAliasInput
  ): LocalKycVerifierAlias {
    return this.localNodeStore().getOrCreateLocalKycVerifierAlias(input);
  }

  getLocalKycVerifierAliasByNodeId(
    verifierNodeId: string
  ): LocalKycVerifierAlias | undefined {
    return this.localNodeStore().getLocalKycVerifierAliasByNodeId(
      verifierNodeId
    );
  }

  listLocalKycVerifierAliases(): LocalKycVerifierAlias[] {
    return this.localNodeStore().listLocalKycVerifierAliases();
  }

  getKycClaimSummary(kycClaimId: string) {
    return getKycClaimSummary(this.engine, kycClaimId);
  }

  private localNodeStore(): KycLocalNodeStore {
    return (this.engine as unknown as { sqliteStore: KycLocalNodeStore })
      .sqliteStore;
  }
}
