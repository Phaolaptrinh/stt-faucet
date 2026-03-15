const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { ethers } = require("ethers");
const path = require("path");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const tokenAbi = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 value) returns (bool)",
];

const token = new ethers.Contract(process.env.TOKEN_ADDRESS, tokenAbi, wallet);

const claimedWallets = new Map();

app.get("/info", async (req, res) => {
  try {
    const [name, symbol, decimals, balance] = await Promise.all([
      token.name(),
      token.symbol(),
      token.decimals(),
      token.balanceOf(wallet.address),
    ]);

    res.json({
      success: true,
      faucetAddress: wallet.address,
      tokenAddress: process.env.TOKEN_ADDRESS,
      tokenName: name,
      symbol,
      decimals: Number(decimals),
      faucetBalance: ethers.formatUnits(balance, decimals),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Không lấy được thông tin faucet",
      error: error.message,
    });
  }
});

app.post("/claim", async (req, res) => {
  try {
    const { address } = req.body;

    if (!address || !ethers.isAddress(address)) {
      return res.status(400).json({
        success: false,
        message: "Địa chỉ ví không hợp lệ",
      });
    }

    const now = Date.now();
    const lastClaim = claimedWallets.get(address);

    if (lastClaim && now - lastClaim < 24 * 60 * 60 * 1000) {
      return res.status(429).json({
        success: false,
        message: "Ví này đã nhận STT trong 24 giờ qua",
      });
    }

    const decimals = await token.decimals();
    const amount = ethers.parseUnits(
      process.env.CLAIM_AMOUNT || "10",
      decimals,
    );

    const faucetBalance = await token.balanceOf(wallet.address);
    if (faucetBalance < amount) {
      return res.status(400).json({
        success: false,
        message: "Ví faucet không đủ STT",
      });
    }

    const tx = await token.transfer(address, amount);
    await tx.wait();

    claimedWallets.set(address, now);

    res.json({
      success: true,
      message: `Đã gửi ${process.env.CLAIM_AMOUNT || "10"} STT thành công`,
      txHash: tx.hash,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Gửi STT thất bại",
      error: error.message,
    });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`STT Faucet running on port ${port}`);
});
