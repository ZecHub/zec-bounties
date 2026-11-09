@echo off
echo ===================================================
echo GabinoTech OS - Submit Bounty PR for Issue #37
echo Destination Payout: gabinotech22@gmail.com
echo ===================================================
git push origin fix/bounty-issue-589
gh pr create --title "Prevent applications for bounties that are no longer accepting applications" --body-file PR_CLAIM_BUNDLE.md
echo [OK] Pull Request submitted. Check https://github.com/ZecHub/zec-bounties/issues/589
pause
