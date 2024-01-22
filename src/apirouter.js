const express = require("express")
const router = express.Router();

router.get("/status", (req, res) => {
  res.status(200).send("All OK!");
});

router.get("/reconfig", (req, res) => {
  res.status(200).send("All OK!");
});

router.get("/generate", (req, res) => {
  res.status(200).send("All OK!");
});

module.exports = router;
