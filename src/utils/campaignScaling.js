// Endless depth accepts any safe campaign number; weird input falls back to campaign 1
export function getSafeCampaignNumber(value) {
  const campaignNumber = Number(value)
  return Number.isSafeInteger(campaignNumber) && campaignNumber >= 1
    ? campaignNumber
    : 1
}

// Every campaign adds 15% difficulty, rounded so API numbers stay predictable
export function getCampaignDifficultyMultiplier(campaignNumber) {
  const safeCampaignNumber = getSafeCampaignNumber(campaignNumber)
  return Number((1 + (safeCampaignNumber - 1) * 0.15).toFixed(2))
}
