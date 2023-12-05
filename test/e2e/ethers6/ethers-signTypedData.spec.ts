import { CloudKmsSigner } from "@packages/cloud-kms-signer/src/cloud-kms-signer";
import { EthersAdapter } from "@packages/ethers-adapter/src/ethers-adapter";
import dotenv from "dotenv";
import { ethers } from "ethers";
import { describe, it, expect, beforeEach } from "vitest";
import testERC20Permit from "./contracts/erc20Permit.json";

dotenv.config();

describe("ethers6CloudKmsSigner signTypedData", () => {
  const provider = new ethers.JsonRpcProvider(process.env.MUMBAI_RPC);
  const cloudKmsSigner = new CloudKmsSigner(process.env.BCP_KMS_NAME as string);
  const cloudSigner = new EthersAdapter({ signer: cloudKmsSigner }, provider);

  let holderAddress: string;

  let contractAddress: string;

  // this wallet pays gas for permit function, so you need to put a balance in this.
  //public 0xe14c8cE4E8085e5560B7DB85e6E742AE4a24bE68
  const spenderWalletPrivateKey =
    "0xd7602dd73fd247bd177117131583b4c0ba8ebaab32a0883ed7b1cf67b8826e76";
  const spenderWallet = new ethers.Wallet(spenderWalletPrivateKey, provider);

  beforeEach(async () => {
    holderAddress = await cloudSigner.getAddress();

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
      holderAddress,
      spenderWallet.address
    );

    expect(beforeAllowance).toBe(ethers.toBigInt(0));

    const domain = {
      name: "MyToken",
      version: "1",
      chainId: 80001,
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

    const value = {
      owner: holderAddress,
      spender: spenderWallet.address,
      value: amountToAllow,
      nonce: await contract.nonces(holderAddress),
      deadline,
    };

    const signature = await cloudSigner.signTypedData(domain, types, value);

    const signatureBytes = ethers.Signature.from(signature);

    const tx = await contract.permit(
      holderAddress,
      spenderWallet.address,
      amountToAllow,
      deadline,
      signatureBytes.v,
      signatureBytes.r,
      signatureBytes.s
    );
    console.log("Permit txHash:", tx.hash);
    await tx.wait();

    const afterAllowance = await contract.allowance(
      holderAddress,
      spenderWallet.address
    );

    expect(afterAllowance).toBe(ethers.toBigInt(amountToAllow));
  }, 400000);
  it("FAIL: Execution reverts if invalid data is set to value", async () => {
    const contract = new ethers.Contract(
      contractAddress,
      testERC20Permit.abi,
      spenderWallet
    );

    const beforeAllowance = await contract.allowance(
      holderAddress,
      spenderWallet.address
    );

    expect(beforeAllowance).toBe(ethers.toBigInt(0));

    const domain = {
      name: "MyToken",
      version: "1",
      chainId: 80001,
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
      nonce: await contract.nonces(holderAddress),
      deadline,
    };

    const signature = await cloudSigner.signTypedData(domain, types, value);

    const signatureBytes = ethers.Signature.from(signature);

    await expect(
      contract.permit(
        holderAddress,
        spenderWallet.address,
        amountToAllow,
        deadline,
        signatureBytes.v,
        signatureBytes.r,
        signatureBytes.s
      )
    ).rejects.toThrow("execution reverted");

    const afterAllowance = await contract.allowance(
      holderAddress,
      spenderWallet.address
    );

    expect(afterAllowance).toBe(ethers.toBigInt(0));
  }, 400000);
});
