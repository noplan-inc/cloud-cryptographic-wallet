import {
  TransactionRequest,
  TypedDataDomain,
  TypedDataField,
  ethers,
} from "ethers";

import { Bytes, Signer } from "@cloud-cryptographic-wallet/signer";

export type EthersAdapterConfig = {
  signer: Signer;
};

export class EthersAdapter extends ethers.AbstractSigner<ethers.JsonRpcApiProvider> {
  private readonly config: EthersAdapterConfig;

  constructor(
    config: EthersAdapterConfig,
    provider: ethers.JsonRpcApiProvider
  ) {
    super(provider);

    this.config = config;
  }

  async signTypedData(
    domain: TypedDataDomain,
    types: Record<string, Array<TypedDataField>>,
    value: Record<string, any>
  ): Promise<string> {
    // Populate any ENS names
    const populated = await ethers.TypedDataEncoder.resolveNames(
      domain,
      types,
      value,
      async (name: string) => {
        // @TODO: this should use resolveName; addresses don't
        //        need a provider

        ethers.assert(
          this.provider != null,
          "cannot resolve ENS names without a provider",
          "UNSUPPORTED_OPERATION",
          {
            operation: "resolveName",
            info: { name },
          }
        );

        const address = await this.provider.resolveName(name);
        ethers.assert(
          address != null,
          "unconfigured ENS name",
          "UNCONFIGURED_NAME",
          {
            value: name,
          }
        );

        return address;
      }
    );

    const hash = ethers.TypedDataEncoder.hash(
      populated.domain,
      types,
      populated.value
    );

    const signature = await this.config.signer.sign(Bytes.fromString(hash));

    return signature.bytes.toString();
  }

  async getAddress(): Promise<string> {
    const address = (await this.config.signer.getPublicKey()).toAddress();

    return ethers.getAddress(address.toString());
  }

  async signMessage(message: ethers.BytesLike | string): Promise<string> {
    const hash = Bytes.fromString(ethers.hashMessage(message));

    const signature = await this.config.signer.sign(hash);

    return signature.bytes.toString();
  }

  async signTransaction(tx: TransactionRequest): Promise<string> {
    const transaction = await ethers.resolveProperties(tx);

    const address = await this.getAddress();

    if (transaction.from != null) {
      if (ethers.getAddress(transaction.from.toString()) !== address) {
        throw ethers.makeError(
          `transaction from address mismatch transaction.from ${transaction.from}`,
          "INVALID_ARGUMENT"
        );
      }
    }

    // reference: sendTransaction in abstract-signer.tx
    const pop = await this.populateTransaction(tx);
    delete pop.from;

    const txObj = ethers.Transaction.from(pop);

    const hash = ethers.keccak256(txObj.unsignedSerialized);

    const signature = await this.config.signer.sign(Bytes.fromString(hash));

    const ethersSignature = ethers.Signature.from({
      v: signature.v,
      r: signature.r.toString(),
      s: signature.s.toString(),
    });

    txObj.signature = ethersSignature;

    return txObj.serialized;
  }

  connect(provider: ethers.JsonRpcApiProvider): EthersAdapter {
    return new EthersAdapter(this.config, provider);
  }
}
