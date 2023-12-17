import { CloudKmsSigner } from "@packages/cloud-kms-signer/src/cloud-kms-signer";
import { EthersAdapter } from "@packages/ethers-adapter/src/ethers-adapter";
import dotenv from "dotenv";
import { ethers } from "ethers";
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import testERC20Permit from "./contracts/erc20Permit.json";
import { sendGasFromHardhat } from "./utils";

dotenv.config();

describe("ethers6CloudKmsSigner signTypedData", () => {
  const provider = new ethers.JsonRpcProvider(process.env.RPC);
  const cloudKmsSigner = new CloudKmsSigner(process.env.BCP_KMS_NAME as string);
  const cloudSigner = new EthersAdapter({ signer: cloudKmsSigner }, provider);

  let cloudWalletAddress: string;
  let contractAddress: string;
  let chainId: bigint;

  let spenderWallet: ethers.Wallet | ethers.HDNodeWallet;

  beforeAll(async () => {
    cloudWalletAddress = await cloudSigner.getAddress();

    chainId = (await provider.getNetwork()).chainId;

    if (chainId === 31337n) {
      spenderWallet = ethers.Wallet.createRandom().connect(provider);

      await sendGasFromHardhat(cloudWalletAddress);
      await sendGasFromHardhat(spenderWallet.address);
    } else {
      if (!process.env.SPENDER_WALLET_PRIVATE_KEY) {
        throw "SPENDER_WALLET_PRIVATE_KEY  is not set";
      }
      spenderWallet = new ethers.Wallet(
        process.env.SPENDER_WALLET_PRIVATE_KEY as string,
        provider
      );
    }
  });

  beforeEach(async () => {
    const factory = new ethers.ContractFactory(
      testERC20Permit.abi,
      testERC20Permit.bytecode,
      cloudSigner
    );
    const contract = (await factory.deploy()) as ethers.Contract;
    await contract.waitForDeployment();
    contractAddress = await contract.getAddress();
  }, 400000);

  it("SUCCESS: Can call permit function with the custom signTypedData", async () => {
    const contract = new ethers.Contract(
      contractAddress,
      testERC20Permit.abi,
      spenderWallet
    );

    const beforeAllowance = await contract.allowance(
      cloudWalletAddress,
      spenderWallet.address
    );

    expect(beforeAllowance).toBe(ethers.toBigInt(0));

    const domain = {
      name: "MyToken",
      version: "1",
      chainId,
      verifyingContract: contractAddress,
    };

    const types = {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const amountToAllow = 10000;
    const deadline = Math.floor(Date.now()) + 3600;

    const beforeNonce = await contract.nonces(cloudWalletAddress);

    const value = {
      owner: cloudWalletAddress,
      spender: spenderWallet.address,
      value: amountToAllow,
      nonce: beforeNonce,
      deadline,
    };

    const signature = await cloudSigner.signTypedData(domain, types, value);

    const signatureBytes = ethers.Signature.from(signature);

    const tx = await contract.permit(
      cloudWalletAddress,
      spenderWallet.address,
      amountToAllow,
      deadline,
      signatureBytes.v,
      signatureBytes.r,
      signatureBytes.s
    );
    console.log("SUCCESS: Permit txHash:", tx.hash);
    await tx.wait();

    const afterAllowance = await contract.allowance(
      cloudWalletAddress,
      spenderWallet.address
    );

    expect(afterAllowance).toBe(ethers.toBigInt(amountToAllow));

    const afterNonce = await contract.nonces(cloudWalletAddress);

    expect(afterNonce - beforeNonce).toEqual(1n);
  }, 400000);
  it("FAIL: Execution reverts if invalid data is set to value", async () => {
    const contract = new ethers.Contract(
      contractAddress,
      testERC20Permit.abi,
      spenderWallet
    );

    const beforeAllowance = await contract.allowance(
      cloudWalletAddress,
      spenderWallet.address
    );

    expect(beforeAllowance).toBe(ethers.toBigInt(0));

    const domain = {
      name: "MyToken",
      version: "1",
      chainId,
      verifyingContract: contractAddress,
    };

    const types = {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const amountToAllow = 10000;
    const deadline = Math.floor(Date.now()) + 3600;

    const randomWallet = ethers.Wallet.createRandom();

    const value = {
      // invalid wallet address
      owner: randomWallet.address,
      spender: spenderWallet.address,
      value: amountToAllow,
      nonce: await contract.nonces(cloudWalletAddress),
      deadline,
    };

    const signature = await cloudSigner.signTypedData(domain, types, value);

    const signatureBytes = ethers.Signature.from(signature);

    await expect(
      contract.permit(
        cloudWalletAddress,
        spenderWallet.address,
        amountToAllow,
        deadline,
        signatureBytes.v,
        signatureBytes.r,
        signatureBytes.s
      )
    ).to.be.rejectedWith("execution reverted");

    const afterAllowance = await contract.allowance(
      cloudWalletAddress,
      spenderWallet.address
    );

    expect(afterAllowance).toBe(ethers.toBigInt(0));
  }, 400000);
});
