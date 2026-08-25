import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { createRoomJoinUrl } from '../roomCode'

interface RoomQrCodeProps {
  code: string
}

export function RoomQrCode({ code }: RoomQrCodeProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const shareUrl = useMemo(
    () => createRoomJoinUrl(code, window.location.origin, import.meta.env.BASE_URL).toString(),
    [code],
  )

  useEffect(() => {
    let active = true
    void QRCode.toDataURL(shareUrl, {
      width: 240,
      margin: 1,
      color: { dark: '#07100f', light: '#d8fff7' },
      errorCorrectionLevel: 'M',
    }).then((url) => {
      if (active) setImageUrl(url)
    }).catch(() => {
      if (active) setImageUrl(null)
    })
    return () => { active = false }
  }, [shareUrl])

  if (!imageUrl) return <div className="room-qr room-qr--loading" aria-label="Đang tạo mã QR" />

  return (
    <img
      className="room-qr"
      src={imageUrl}
      alt={`Mã QR tham gia phòng ${code}`}
      width="120"
      height="120"
    />
  )
}
