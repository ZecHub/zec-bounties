@echo off
echo ===================================================
echo GabinoTech OS - Submit Bounty PR for Issue #19
echo Destination Payout: gabinotech22@gmail.com
echo ===================================================
git push origin fix/bounty-issue-571
gh pr create --title "bug(payments): admin payout panel leaks team bounties into warnings, hides in-flight/blocked banners when empty, and team panel drops duplicate-title payouts" --body-file PR_CLAIM_BUNDLE.md
echo [OK] Pull Request submitted. Check https://github.com/ZecHub/zec-bounties/issues/571
pause
