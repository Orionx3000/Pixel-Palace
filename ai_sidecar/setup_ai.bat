@echo off
REM Pixel Palace AI sidecar setup (Windows)
REM Installs Python deps and points the sidecar at your downloaded models.
REM Models are NOT bundled (they are large); place/copy them where you like and
REM set PP_SD_CKPT / PP_SD_LORA below (or pass env when launching).

echo Installing Python dependencies (torch + diffusers + pillow + numpy + safetensors)...
pip install --upgrade pip
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install diffusers pillow numpy safetensors

REM --- Model paths -----------------------------------------------------------
REM Edit these to match where you put the downloaded Civitai files.
REM SD1.5 base (already downloaded): allInOnePixelModel_v1.ckpt
set PP_SD_CKPT=D:\allInOnePixelModel_v1.ckpt
REM Optional SD1.5 LoRA (2D Pixel Toolkit or M_Pixel):
set PP_SD_LORA=D:\2D_Pixel_Toolkit.safetensors
REM For SDXL: set PP_SD_ARCH=sdxl and point PP_SD_CKPT at an SDXL base + PP_SD_LORA at Pixel Art XL.
set PP_SD_ARCH=sd15

echo.
echo Setup done. Start the sidecar with:
echo   python ai_sidecar\sidecar.py 18755
echo Then in Pixel Palace, open Pixscii -> Generate (AI).
echo.
echo License note: SD1.5 pixel models here use CreativeML OpenRAIL-M, which
echo PERMITS commercial use of generated images (you own the output). The SDXL
echo "Pixel Art XL" LoRA also uses an OpenRAIL variant. Keep the RAIL use
echo restrictions (no illegal/harmful content).
pause
