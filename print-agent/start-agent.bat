@echo off
REM LQ-310 列印 agent 啟動檔(執行同資料夾的 exe)。
REM CORS 已內建 localhost + Vercel 網域,客戶端零設定即可。
REM 只有換網域 / 要加別的來源時,才取消下一行註解並填入:
REM set ALLOWED_ORIGINS=https://my-new-domain.vercel.app
"%~dp0do-print-agent.exe"
