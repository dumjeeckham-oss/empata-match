const KAKAO_REST_API_KEY = "feeef733a440f08a3e07072228ec57ea";

interface GeoResult {
  lat: number;
  lng: number;
  address: string;
}

export async function geocodeAddress(address: string): Promise<GeoResult | null> {
  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`,
      { headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` } }
    );
    const data = await res.json();
    if (data.documents?.length > 0) {
      const d = data.documents[0];
      return { lat: parseFloat(d.y), lng: parseFloat(d.x), address: d.address_name || address };
    }
    // Try keyword search as fallback
    const res2 = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(address)}`,
      { headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` } }
    );
    const data2 = await res2.json();
    if (data2.documents?.length > 0) {
      const d = data2.documents[0];
      return { lat: parseFloat(d.y), lng: parseFloat(d.x), address: d.address_name || address };
    }
    return null;
  } catch (e) {
    console.error("Geocode error:", e);
    return null;
  }
}

export function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
