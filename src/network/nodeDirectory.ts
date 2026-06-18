import { NodeProfile, NodeRole } from "./nodeProfile";

export class NodeDirectory {
  private nodes = new Map<string, NodeProfile>();

  addNode(node: NodeProfile): void {
    this.nodes.set(node.node_id, node);
  }

  getNode(node_id: string): NodeProfile | undefined {
    return this.nodes.get(node_id);
  }

  listNodes(): NodeProfile[] {
    return [...this.nodes.values()];
  }

  findOnlineNodes(): NodeProfile[] {
    return this.listNodes().filter((node) => node.online);
  }

  findByZone(zone: string): NodeProfile[] {
    return this.findOnlineNodes().filter((node) => node.zone === zone);
  }

  findByRole(role: NodeRole): NodeProfile[] {
    return this.findOnlineNodes().filter((node) => node.roles.includes(role));
  }

  count(): number {
    return this.nodes.size;
  }
}