export function getUrgentTrainingSafetyResponse(text) {
  const signal = classifyUrgentTrainingSafetySignal(text);

  if (signal === "dark_urine") {
    return "Antrenmani hemen birak. Koyu, kola veya cay renkli idrar yogun egzersiz sonrasi acil degerlendirilmesi gereken bir belirti olabilir. Bugun acil servise basvur; belirgin kas agrisi, gucsuzluk veya az idrar varsa bekleme.";
  }

  if (signal === "severe_muscle_symptoms") {
    return "Antrenmani hemen birak. Siddetli kas agrisi ve belirgin gucsuzluk yogun egzersiz sonrasi acil degerlendirilmesi gereken belirtiler olabilir. Bugun acil servise basvur; koyu idrar, sislik veya az idrar varsa bekleme.";
  }

  if (signal === "suspected_concussion") {
    return "Temasi ve oyunu hemen birak; ayni gun oyuna donme. Bas darbesi sonrasi denge kaybi, kusma, sersemlik veya artan bas agrisi sarsinti suphelidir ve saglik degerlendirmesi gerekir. Belirti kotulesiyorsa, nobet, tekrarlayan kusma veya bilinc degisikligi varsa 112'yi ara.";
  }

  if (signal === "exertional_heat_illness") {
    return "Aktiviteyi hemen durdur ve sicak ortamdan uzaklas. Sicakta bilinc degisikligi, cokme, nobet veya belirgin koordinasyon kaybi acil durum olabilir; 112'yi ara ve kisiyi yalniz birakma.";
  }

  if (signal === "cardiorespiratory") {
    return "Egzersizi durdur. Belirti su an suruyorsa, siddetliyse veya gogus rahatsizligi, nefes darligi ya da bayilma varsa 112'yi ara; kendin arac kullanma. Belirti gecse bile antrenmana donmeden once tibbi degerlendirme al.";
  }

  return null;
}

export function hasUrgentTrainingSafetySignal(text) {
  return classifyUrgentTrainingSafetySignal(text) !== null;
}

export function getPreventiveTrainingSafetyResponse(text) {
  const normalized = normalize(text);
  const headImpact = /\b(?:kafama|basima)\s+(?:darbe|carpma)\w*.{0,24}\b(?:aldim|oldu)\b/.test(normalized);
  const contactReturn = /\b(?:bugun|simdi|yarin)\b.{0,30}\b(?:sparring|mac|oyun|antrenman|temas)\b/.test(normalized)
    || /\b(?:sparring|maca|oyuna|antrenmana|temasa)\b.{0,30}\b(?:yapayim|gireyim|donebilir|donsem|devam)\w*/.test(normalized);
  if (headImpact && contactReturn) {
    return "Bas darbesinden sonra belirti olmasa bile bugun temasa donme. Sarsinti belirtileri gecikebilir; antrenorunu bilgilendir ve spora donus icin saglik profesyoneli degerlendirmesi al.";
  }

  const rapidTimeframe = /\b(?:[1-7]|bir|iki|uc|dort|bes|alti|yedi)\s+gun(?:de)?\b/.test(normalized);
  const substantialWeight = /\b(?:[2-9]|[1-9]\d+)\s*(?:kg|kilo)\b/.test(normalized);
  const weightCutIntent = /\b(?:kilo\s+)?(?:kes|ver|dusur)\w*/.test(normalized);
  const dehydrationMethod = /\b(?:sauna|susuz|sivi kisit|diuretik|plastik kiyafet)\w*/.test(normalized);
  if ((rapidTimeframe && substantialWeight && weightCutIntent) || (weightCutIntent && dehydrationMethod)) {
    return "Bu kadar hizli kilo kesme veya dehidrasyon protokolu veremem; ciddi saglik riski tasiyabilir. Antrenmani ve kilo kategorisi hedefini spor hekimi ile spor diyetisyeni gozetiminde planla.";
  }

  const openWater = /\b(?:acik su|acik suda|deniz|gol)\b/.test(normalized);
  const alone = /\b(?:tek basima|yalniz)\b/.test(normalized);
  const swimmingIntent = /\b(?:yuz|yuzme|gireyim)\w*/.test(normalized);
  if (openWater && alone && swimmingIntent) {
    return "Ilk acik su denemesinde yalniz yuzme. Cankurtaranli veya kontrollu bir alan, deneyimli eslikci, gorunurluk ekipmani ve hava-su kosullari kontrolu olmadan suya girme.";
  }

  const youngAthlete = /\b(?:kizim|oglum|cocugum)\b/.test(normalized) || /\b(?:[1-9]|1[0-7])\s+yas(?:inda)?\b/.test(normalized);
  const adultOrEliteTemplate = /\b(?:elit|yetiskin|profesyonel|maksimum)\s+program\w*/.test(normalized);
  if (youngAthlete && adultOrEliteTemplate) {
    return "Genc sporcuya yetiskin programi kopyalamak dogru degil. Spor dali, yas, buyume-gelisim, okul ve uyku yuku ile teknik gozetimi bilen nitelikli bir antrenor ve gerekirse saglik profesyoneliyle bireysellestirin.";
  }

  return null;
}

function classifyUrgentTrainingSafetySignal(text) {
  const normalized = removeNegatedSymptoms(normalize(text));

  const suspectedConcussion = /\b(?:kafama|basima|kafasina|basina)\s+(?:darbe|carpma)\w*.{0,24}\b(?:aldim|aldi|vurdum|oldu)\b/.test(normalized)
    && /\b(?:denge|koordinasyon|kust|kusma|sersem|bilinc|bas agr|bayil)\w*/.test(normalized);
  if (suspectedConcussion) return "suspected_concussion";

  const exertionalHeatIllness = /\b(?:sicak|sicakta|guneste|asiri sicak)\w*/.test(normalized)
    && /\b(?:bilinc|yere cok|coktum|nobet|koordinasyon kayb|bayil)\w*/.test(normalized);
  if (exertionalHeatIllness) return "exertional_heat_illness";

  const darkUrineReported = /(?:idrarim|idrarimin)\s+(?:koyu\b|(?:kola|cay)(?:\s+renginde)?)/.test(normalized)
    || /(?:koyu|kola|cay)\s+renkli\s+(?:idrarim|idrarimin)/.test(normalized)
    || /(?:koyu(?: renkli)? idrar\w*|idrar\w*\s+(?:kola|cay) reng).{0,20}\b(?:var|oldu|gordum)\b/.test(normalized);
  if (darkUrineReported) return "dark_urine";

  const severeMuscleSymptoms = /\b(?:cok|siddetli)\s+kas agr\w*/.test(normalized) && /\bgucsuz\w*/.test(normalized);
  if (severeMuscleSymptoms) return "severe_muscle_symptoms";

  const reportedCardiorespiratorySymptom = /(?:gogus (?:rahatsizlig|agr)|nefes darlig|carpint)\w*.{0,24}\b(?:var|yasiyorum|yasadim|oldu|basladi|suruyor|gecmiyor)\b/.test(normalized)
    || /\b(?:gogsum agriyor|gogsumde agri var|nefesim daraliyor|nefes almakta zorlaniyorum|nefes alamiyorum|basim donuyor|basim dondu|bayildim|bayiliyorum|bayilacak gibiyim|senkop gecirdim)\b/.test(normalized);
  if (reportedCardiorespiratorySymptom) return "cardiorespiratory";

  return null;
}

function removeNegatedSymptoms(value) {
  return value
    .replace(/(?:idrar\w*\s+(?:koyu|(?:kola|cay)(?:\s+renginde)?)|koyu(?:\s+renkli)?\s+idrar\w*|(?:kola|cay)\s+renkli\s+idrar\w*)(?:\s+\w+){0,2}\s+(?:yok|degil|olmadi)\b/g, " ")
    .replace(/(?:gogus (?:rahatsizlig|agr)|nefes darlig|carpint|bayil|senkop|kas agr|gucsuz)\w*(?:\s+\w+){0,2}\s+(?:yok|degil|yasamiyorum|olmadi)\b/g, " ");
}

function normalize(value) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("ı", "i");
}
