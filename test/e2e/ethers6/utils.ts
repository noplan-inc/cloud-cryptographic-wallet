import { ethers } from "ethers";
import hre from "hardhat";
import dotenv from "dotenv";

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.RPC);

export const sendGasFromHardhat = async (receiverAddress: string) => {
  // @ts-ignore
  const [hardhatSigner] = await hre.ethers.getSigners();
  hardhatSigner.provider = provider;

  await hardhatSigner.sendTransaction({
    to: receiverAddress,
    value: ethers.parseEther("100.0"),
  });
};
