const { assert, expect } = require("chai")
const { network, deployments, ethers, getNamedAccounts } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Nft Marketplace Unit Tests", () => {
          let nftMarketplace, basicNft, deployer, player
          const PRICE = ethers.utils.parseEther("0.1")
          const TOKEN_ID = 0
          beforeEach(async () => {
              const accounts = await ethers.getSigners()
              deployer = accounts[0]
              player = accounts[1]
              await deployments.fixture(["all"])
              nftMarketplace = await ethers.getContract("NftMarketplace")
              basicNft = await ethers.getContract("BasicNft")
              await basicNft.mintNft()
              await basicNft.approve(nftMarketplace.address, TOKEN_ID)
          })

          describe("listItem", () => {
              it("reverts if Nft is already listed", async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  await expect(
                      nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith("AlreadyListed")
              })
              it("reverts if price is below or equal to 0", async () => {
                  await expect(
                      nftMarketplace.listItem(basicNft.address, TOKEN_ID, 0)
                  ).to.be.revertedWith("PriceMustBeAboveZero")
              })
              it("exclusively allows owners to list", async () => {
                  nftMarketplacePlayer = nftMarketplace.connect(player)
                  await basicNft.approve(player.address, TOKEN_ID)
                  await expect(
                      nftMarketplacePlayer.listItem(basicNft.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith("NotOwner")
              })
              it("needs approvals to list item", async () => {
                  await basicNft.approve(ethers.constants.AddressZero, TOKEN_ID)
                  await expect(
                      nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith("NftMarketPlace__NotApprovedForMarketPlace()")
              })
              it("successfully emits an event after Nft has been listed", async () => {
                  await expect(nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE))
                      .to.emit(nftMarketplace, "ItemListed")
                      .withArgs(deployer.address, basicNft.address, TOKEN_ID, PRICE)
              })
              it("Updates listing with seller and price", async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  const listing = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                  assert(listing.price.toString() == PRICE.toString())
                  assert(listing.seller.toString() == deployer.address)
              })
          })

          describe("buyItem", () => {
              let playerConnectedNftMarketplace
              beforeEach(async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  playerConnectedNftMarketplace = nftMarketplace.connect(player)
              })
              it("reverts if buying price is not met", async () => {
                  await expect(
                      playerConnectedNftMarketplace.buyItem(basicNft.address, TOKEN_ID, {
                          value: 0,
                      })
                  ).to.be.revertedWith("PriceNotMet")
              })
              it("Proceeds go to seller after Nft is bought", async () => {
                  await playerConnectedNftMarketplace.buyItem(basicNft.address, TOKEN_ID, {
                      value: PRICE,
                  })
                  const deployerProceeds = await nftMarketplace.getProceeds(deployer.address)
                  assert(deployerProceeds.toString() == PRICE.toString())
              })
              it("Transfers ownership of nft to buyer after purchase", async () => {
                  await playerConnectedNftMarketplace.buyItem(basicNft.address, TOKEN_ID, {
                      value: PRICE,
                  })
                  const newOwner = await basicNft.ownerOf(TOKEN_ID)
                  assert(newOwner.toString() == player.address)
              })
              it("Emits an event after purchase", async () => {
                  await expect(
                      playerConnectedNftMarketplace.buyItem(basicNft.address, TOKEN_ID, {
                          value: PRICE,
                      })
                  )
                      .to.emit(nftMarketplace, "ItemBought")
                      .withArgs(player.address, basicNft.address, TOKEN_ID, PRICE)
              })
              it("Removes listing after purchase", async () => {
                  await playerConnectedNftMarketplace.buyItem(basicNft.address, TOKEN_ID, {
                      value: PRICE,
                  })
                  const listing = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                  assert(listing.price.toString() == "0")
              })
          })

          describe("cancelItem", () => {
              it("reverts if there is no listing", async () => {
                  const error = `NotListed("${basicNft.address}", ${TOKEN_ID})`
                  await expect(
                      nftMarketplace.cancelItem(basicNft.address, TOKEN_ID)
                  ).to.be.revertedWith(error)
              })
              it("reverts of anyone but the owner tries to call", async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  nftMarketplace = nftMarketplace.connect(player)
                  await basicNft.approve(player.address, TOKEN_ID)
                  await expect(
                      nftMarketplace.cancelItem(basicNft.address, TOKEN_ID)
                  ).to.be.revertedWith("NotOwner")
              })
              it("emits an event and removes listing", async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  expect(await nftMarketplace.cancelItem(basicNft.address, TOKEN_ID)).to.emit(
                      "ItemCanceled"
                  )
                  const listing = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                  assert(listing.price.toString() == "0")
              })
          })

          describe("updateListing", () => {
              it("must be owner and listed", async () => {
                  await expect(
                      nftMarketplace.updateListing(basicNft.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith("NotListed")
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  nftMarketplace = nftMarketplace.connect(player)
                  await expect(
                      nftMarketplace.updateListing(basicNft.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith("NotOwner")
              })
              it("updates the price of the item", async () => {
                  const updatedPrice = ethers.utils.parseEther("0.2")
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  expect(
                      await nftMarketplace.updateListing(basicNft.address, TOKEN_ID, updatedPrice)
                  ).to.emit("ItemListed")
                  const listing = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                  assert(listing.price.toString() == updatedPrice.toString())
              })
          })

          describe("withdrawProceeds", () => {
              it("does not allow 0 proceed withdrawls", async () => {
                  await expect(nftMarketplace.withdrawProceeds()).to.be.revertedWith("NoProceeds")
              })
              it("withdraws proceeds", async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  const playerConnectedNftMarketplace = nftMarketplace.connect(player)
                  await playerConnectedNftMarketplace.buyItem(basicNft.address, TOKEN_ID, {
                      value: PRICE,
                  })

                  const deployerProceedsBefore = await nftMarketplace.getProceeds(deployer.address)
                  const deployerBalanceBefore = await deployer.getBalance()
                  const txReponse = await nftMarketplace.withdrawProceeds()
                  const transactionReceipt = await txReponse.wait(1)
                  const { gasUsed, effectiveGasPrice } = transactionReceipt
                  const gasCost = gasUsed.mul(effectiveGasPrice)
                  const deployerBalanceAfter = await deployer.getBalance()

                  assert(
                      deployerBalanceAfter.add(gasCost).toString() ==
                          deployerProceedsBefore.add(deployerBalanceBefore).toString()
                  )
              })
          })
      })
