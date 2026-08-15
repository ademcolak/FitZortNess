# Antrenman Bilgi Katmani: Kanit Temeli ve Veri Tasarimi

Son arastirma: 2026-07-15

## Amac ve kapsam

Bu belge, FitZortNess'in yalnızca hareket kataloglayan bir bot olmaktan çıkıp antrenman programlarını siniflandirabilen, temel programlama degiskenlerini degerlendirebilen ve belirsizligi dürüstçe aktarabilen bir bilgi katmanina dönüsmesi için kaynak temeli sunar.

Kapsam saglikli yetiskinlerde genel direnç antrenmanidir. Hastalik, rehabilitasyon, tani, tedavi, yaralanma sonrasi spora dönüs ve yarismaci sporcu programlamasi bu katmanin yetki alani degildir. ACSM'nin güncel direnç antrenmani pozisyon metni de saglikli yetiskinleri kapsar; klinik gruplara otomatik genellenmemelidir ([ACSM 2026 pozisyon metni, PubMed](https://pubmed.ncbi.nlm.nih.gov/41843416/)).

## Yönetici özeti

1. **Split adi hedef degil, dagitim biçimidir.** Hacim esit oldugunda full-body ile split rutinler arasinda kuvvet ve hipertrofi bakimindan anlamli fark bulunmamistir. Bu nedenle bot “PPL her zaman daha iyi” gibi bir hüküm vermemeli; sürdürülebilirlik, gerçek haftalik hacim, kas basina frekans ve toparlanma üzerinden konusmalidir ([2024 sistematik derleme ve meta-analiz](https://pubmed.ncbi.nlm.nih.gov/38595233/)).
2. **Frekans tek basina sihirli degildir.** Hacim esitlendirilince hipertrofi ve kuvvet farklarinin büyük bölümü kaybolur; daha yüksek frekans özellikle haftalik hacmi yönetilebilir seanslara dagitmak için kullanislidir ([hipertrofi meta-analizi](https://pubmed.ncbi.nlm.nih.gov/30558493/), [kuvvet meta-analizi](https://pubmed.ncbi.nlm.nih.gov/29470825/)).
3. **Güncel baslangiç çizgisi basittir.** ACSM 2026, tüm ana kas gruplarini haftada en az iki gün çalistirmayi, kademeli ilerlemeyi ve kisinin sürdürebilecegi programi seçmeyi öne çikarir ([ACSM resmi özet infografik](https://www.acsm.org/wp-content/uploads/2026/03/Resistance-Training-Position-Stand-infographic.pdf)). WHO da yetiskinler için ana kas gruplarini kapsayan güçlendirme etkinliklerini haftada en az iki gün önerir ([WHO 2020 kilavuzu](https://www.who.int/publications/i/item/9789240015128)).
4. **Tek bir “hipertrofi tekrar araligi” yoktur.** Çesitli yük reçeteleri kas büyümesini destekleyebilir; azami kuvvet için daha agir yükler daha yüksek siralanirken hipertrofi için çoklu setler belirgin bir etkendir ([2023 Bayesian ag meta-analizi](https://pubmed.ncbi.nlm.nih.gov/37414459/)). Güncel ACSM özeti kuvvet odaginda yaklasik yüzde 80 1RM ve üzerini, 2-3 seti; hipertrofide kas basina yaklasik 10 haftalik seti bir baslangiç hedefi olarak vurgular ([ACSM 2026 infografik](https://www.acsm.org/wp-content/uploads/2026/03/Resistance-Training-Position-Stand-infographic.pdf)). Bu sayilar herkes için zorunlu bir taban veya tavan reçetesi degildir.
5. **Tükenise gitmek zorunlu degildir.** Hacim esitlendirilmis çalismalarda tükenis ve tükenis öncesi bitirme benzer kuvvet/hipertrofi sonuçlari verebilir ([2022 sistematik derleme ve meta-analiz](https://pubmed.ncbi.nlm.nih.gov/33497853/)). ACSM 2026 da ortalama saglikli yetiskin için anlik kas tükenisini zorunlu bir “ileri teknik” saymaz ([ACSM 2026 infografik](https://www.acsm.org/wp-content/uploads/2026/03/Resistance-Training-Position-Stand-infographic.pdf)).
6. **Deload otomatik takvim kuralina dönüstürülmemelidir.** Deload literatürü halen sinirlidir; uzman uzlasisi bunu yorgunlugu azaltmak ve sonraki döneme hazirligi artirmak için egitim stresinin geçici azaltilmasi olarak ele alir, ancak tek bir üstün protokol belirlemez ([2023 Delphi uzlasisi](https://pubmed.ncbi.nlm.nih.gov/37730925/)). Bir haftalik tam ara, bir RCT'de hipertrofiyi degistirmemekle birlikte alt vücut kuvvet artislarini olumsuz etkilemistir ([2024 RCT](https://pubmed.ncbi.nlm.nih.gov/38274324/)).
7. **Kaynak metinleri egitim verisi diye kopyalamak dogru degildir.** PMC'de ücretsiz okunabilen her makale yeniden kullanim lisansina sahip degildir; yalnizca lisansi dogrulanmis PMC Open Access Subset içerigi toplu yeniden kullanim için uygundur ([NIH/PMC telif açiklamasi](https://pmc.ncbi.nlm.nih.gov/about/copyright/), [PMC OA Subset](https://pmc.ncbi.nlm.nih.gov/tools/openftlist/)). Ürün veri katmani özgün kisa özet, olgusal alanlar, DOI/PMID/URL ve lisans bilgisini saklamali; yayin metnini saklamamalidir.

## 1. Program ve split taksonomisi

### 1.1 Bilimsel üst kategoriler

| Kimlik | Tanim | Bilgi katmanindaki rolü |
| --- | --- | --- |
| `full_body` | Bir seansta tüm veya çogu ana kas grubunun çalistirilmasi | Bilimsel karsilastirmalarda kullanilan üst kategori |
| `split` | Kas gruplarinin veya hareket örüntülerinin farkli seanslara dagitilmasi | Bilimsel karsilastirmalarda kullanilan üst kategori |

Full-body ve split üst kategorileri dogrudan karsilastirilmistir; hacim esit oldugunda ikisi de benzer kuvvet ve kas büyümesi üretmistir ([2024 sistematik derleme ve meta-analiz](https://pubmed.ncbi.nlm.nih.gov/38595233/)). Dolayisiyla `split_type` tek basina kalite puani üretmemelidir.

### 1.2 Uygulama düzenleri

| Kimlik | Yaygin adlar | Seans bölümü | Siniflandirma |
| --- | --- | --- | --- |
| `full_body` | full body, tüm vücut | Her seansta ana kas gruplarinin çogu | Dagitim düzeni |
| `upper_lower` | upper/lower, üst-alt | Üst vücut ve alt vücut günleri | Split alt türü |
| `push_pull_legs` | PPL, itis-çekis-bacak | Itme kaslari, çekme kaslari ve bacaklar | Split alt türü |
| `body_part` | bro split, kas grubu split | Gögüs, sirt, omuz, kol, bacak gibi bölümler | Split alt türü |
| `movement_pattern` | push/pull, hinge/squat vb. | Hareket örüntülerine göre | Split alt türü |
| `hybrid` | güç/hipertrofi veya full/split karisimi | Birden fazla düzenin birlesimi | Gerçek günler okunarak belirlenir |

NSCA, split rutinleri vücut bölgesi, kas alani veya push/pull gibi hareket örüntülerine göre düzenlenebilen yapilar olarak açiklar; dört günlük upper/lower ve daha yüksek frekansli push/pull/legs örneklerini verir ([NSCA resmi egitim metni](https://www.nsca.com/education/articles/kinetic-select/determination-of-resistance-training-frequency/)). Bu örnekler bir splitin digerinden üstün oldugunu kanitlamaz; haftalik yükü ve toparlanmayi düzenlemek için organizasyon seçenekleridir.

### 1.3 Popüler adlar ve program markalari

Asagidaki siniflandirma, adlarin tek basina bilimsel sonuç üretmesini önlemek için önerilen ürün taksonomisidir. Yalnizca PHAT ve 5/3/1'in yaratici/program kökenine iliskin olgusal satirlar kaynak iddiasi tasir.

| Ad | Üründeki sinif | Neden |
| --- | --- | --- |
| Bro split | `alias -> body_part` | Günlerin gerçek kas dagilimi okunmadan hacim ve frekans bilinemez. |
| Arnold split | `ambiguous_template_alias` | Tek bir standart bilimsel protokol gibi ele alinmamalidir; kullanicidan günler istenir. |
| PHUL | `ambiguous_named_template` | Isimden reçete üretmek yerine gerçek sürüm/günler istenir. |
| PHAT | `creator_named_program` ve gerçek yapisina göre `hybrid` | Layne Norton bunu kendi adlandirilmis programi olarak yayimlar; bilimsel bir sonuç kategorisi degildir ([Biolayne PHAT sayfasi](https://biolayne.com/phat/), [yaraticinin program yazisi](https://biolayne.com/articles/training/phat-power-hypertrophy-adaptive-training/)). |
| 5/3/1 | `creator_program_system` | Jim Wendler'in kitap ve program ailesidir; tek bir split degildir ([yaraticinin program katalogu](https://www.jimwendler.com/collections/books-programs)). Örnegin Boring But Big, 5/3/1 içinde 3 veya 4 günlük bir yardimci sablondur ([yaraticinin BBB açiklamasi](https://www.jimwendler.com/blogs/jimwendler-com/101077382-boring-but-big)). |

**Ürün karari:** Bot bu adlari tanimali fakat yalnizca addan hareket, set, tekrar, frekans veya deload uydurmamalidir. “Hangi sürüm?” diye sormali veya kullanicidan haftalik programini yapistirmasini istemelidir. Bilimsel degerlendirme marka adi yerine normalize edilmis gerçek reçete üzerinden yapilmalidir.

## 2. Frekans, hacim ve split seçimi

### 2.1 Kanit özeti

- WHO ve ACSM, genel saglik baslangici için tüm ana kas gruplarini haftada en az iki gün çalistirma yönünde ayni tabani destekler ([WHO kilavuzu](https://www.who.int/publications/i/item/9789240015128), [ACSM 2026 infografik](https://www.acsm.org/wp-content/uploads/2026/03/Resistance-Training-Position-Stand-infographic.pdf)).
- Kas basina haftalik hacim esit oldugunda, hipertrofi için frekans tek basina anlamli veya pratik açidan büyük fark göstermemistir ([2019 sistematik derleme ve meta-analiz](https://pubmed.ncbi.nlm.nih.gov/30558493/)). Kuvvet meta-analizinde de hacim esit alt grupta frekans farki anlamli degildir ([2018 sistematik derleme ve meta-analiz](https://pubmed.ncbi.nlm.nih.gov/29470825/)).
- Daha yüksek haftalik set hacmi ortalamada daha fazla hipertrofiyle iliskilidir; ancak bireysel tolerans ve azalan getiriler nedeniyle “ne kadar çok o kadar iyi” kuralina dönüstürülmemelidir ([2017 doz-cevap meta-analizi](https://pubmed.ncbi.nlm.nih.gov/27433992/)). ACSM'nin güncel halka dönük özeti hipertrofi hedefi için kas basina yaklasik 10 haftalik seti pratik bir odak olarak verir ([ACSM 2026 infografik](https://www.acsm.org/wp-content/uploads/2026/03/Resistance-Training-Position-Stand-infographic.pdf)).
- NSCA, yeni baslayanlarda full-body antrenmani haftada 2-3 ardışık olmayan gün; orta seviyede 3-4 gün ve split kullanimi; ileri seviyede hedefe göre 4-6 gün seçeneklerini açiklar ([NSCA resmi egitim metni](https://www.nsca.com/education/articles/kinetic-select/determination-of-resistance-training-frequency/)). Bu seviyeler katı bir performans sinifi degil, ilk program önerisini sinirlayan bir rehber olarak kullanilmalidir.

### 2.2 Gün sayisina göre karar tablosu

Asagidaki tablo bir **ürün sezgisidir**; “bilimsel olarak tek en iyi split” iddiasi degildir. Temel amaç, ACSM/WHO'nun iki haftalik temas tabanini, NSCA'nin programlama örneklerini ve hacim esitliginde splitlerin benzer sonuç verdigi bulgusunu kullanici takvimine çevirmektir ([ACSM](https://www.acsm.org/wp-content/uploads/2026/03/Resistance-Training-Position-Stand-infographic.pdf), [WHO](https://www.who.int/publications/i/item/9789240015128), [NSCA](https://www.nsca.com/education/articles/kinetic-select/determination-of-resistance-training-frequency/), [split meta-analizi](https://pubmed.ncbi.nlm.nih.gov/38595233/)).

| Haftalik uygun gün | Varsayilan aday | Botun açiklamasi |
| --- | --- | --- |
| 0 | Program yazma; niyeti netlestir | “Su an yapmiyorum” geçerli bir profil bilgisidir. Baslamak isteyip istemedigini ve gerçekçi ilk adimi sor. |
| 1 | Kisa full-body | Bir gün hiç yoktan iyidir; fakat ana kaslari iki gün çalistirma tabanini karsilamaz. Kisit kaliciysa tek günü verimli kullan. |
| 2 | Full-body x2 | Yeni baslayan ve zamani kisitli kullanici için basit dagitim. Upper/lower x1 de uygulanabilir, fakat her bölge yalniz bir seans görür. |
| 3 | Full-body x3 veya ihtiyaca göre hibrit | PPL x1 mümkün olsa da addan dolayi üstün sayilmaz; kas basina gerçek hacim ve temas kontrol edilir. |
| 4 | Upper/lower x2 veya esdeger split/full-body dagitimi | Hacmi dört yönetilebilir seansa bölmek için uygun aday. |
| 5 | Upper/lower + hedef günü, dönen PPL veya özellestirilmis hibrit | Deneyim, seans süresi, diger sporlar ve toparlanma sorulmadan sablon seçilmez. |
| 6 | PPL x2 veya baska dengeli split | Kas basina iki temas saglamak kolaydir; ancak alti gün yeni baslayana otomatik önerilmez. |
| 7 | Varsayilan program üretme | Dinlenme, diger yükler, deneyim ve amaç netlesmeden yedi direnç günü reçete edilmez. |

### 2.3 Split degerlendirme ölçütleri

Bot, split adina puan vermek yerine su alanlari deterministik olarak hesaplamalidir:

- `weekly_sessions`
- Kas basina `direct_sets` ve ayrica daha belirsiz `indirect_sets`
- Kas basina `stimulus_days`
- Ayni kas grubuna yönelik seanslar arasindaki yaklasik dinlenme süresi
- Seans basina hareket ve set yigilmasi
- Itis/çekis, diz-dominant/kalça-dominant ve yatay/dikey örüntü kapsami
- Kullanici takvimine ve ekipmanina uyum
- Önceki haftaya göre yük, tekrar ve set degisimi
- Agri, semptom veya bilinen hastalik nedeniyle güvenlik kapisi

Hacim esitliginde split adinin sonuçlari belirlememesi ve yüksek frekansin çoğunlukla hacmi dagitma araci olmasi bu tasarimi destekler ([split meta-analizi](https://pubmed.ncbi.nlm.nih.gov/38595233/), [frekans meta-analizi](https://pubmed.ncbi.nlm.nih.gov/30558493/)).

## 3. Set, tekrar, yük ve çaba

### 3.1 Hedefe göre temel bilgi

| Hedef | Kanita dayali kisa ifade | Bot davranisi |
| --- | --- | --- |
| Genel saglik / baslangiç | Düzenli olarak ana kas gruplarini haftada en az iki gün çalistir; kademeli ilerle ([ACSM 2026](https://www.acsm.org/wp-content/uploads/2026/03/Resistance-Training-Position-Stand-infographic.pdf), [WHO](https://www.who.int/publications/i/item/9789240015128)). | Minimum uygulanabilir program ve devamlılığı öncele. |
| Azami kuvvet | Daha agir yükler, özellikle yüzde 80 1RM ve üzeri, kuvvet kazanimi için daha yüksek siralanir ([2023 ag meta-analizi](https://pubmed.ncbi.nlm.nih.gov/37414459/)); ACSM özeti 2-3 seti pratik hedef olarak verir ([ACSM 2026](https://www.acsm.org/wp-content/uploads/2026/03/Resistance-Training-Position-Stand-infographic.pdf)). | Teknik, deneyim ve güvenlik uygunsa daha agir odak; yeni kullanicida max test zorunlu degil. |
| Hipertrofi | Farkli yüklar kas büyümesi saglayabilir; çoklu set ve yeterli haftalik hacim önemlidir ([2023 ag meta-analizi](https://pubmed.ncbi.nlm.nih.gov/37414459/)). ACSM özeti yaklasik 10 set/kas/haftayi bir odak olarak verir ([ACSM 2026](https://www.acsm.org/wp-content/uploads/2026/03/Resistance-Training-Position-Stand-infographic.pdf)). | Tek “8-12 tekrar kutsaldir” cevabi verme; yük, çaba, set ve toparlanmayi birlikte degerlendir. |
| Güç | ACSM 2026, orta yükleri yaklasik yüzde 30-70 1RM ve hizli konsantrik fazi öne çikarir ([ACSM 2026](https://www.acsm.org/wp-content/uploads/2026/03/Resistance-Training-Position-Stand-infographic.pdf)). | Teknik yeterlilik ve güvenlik olmadan patlayici varyasyon yazma. |
| Lokal kas dayanikliligi | Daha hafif yük ve daha yüksek tekrar kullanimi klasik ACSM progresyon metninde yer alir ([ACSM pozisyon metni](https://pubmed.ncbi.nlm.nih.gov/11828249/)). | Amaç gerçekten dayaniklilik ise tekrar araligini yükselt; hipertrofi varsayma. |

### 3.2 Tükenis ve tekrar rezervi

Tükenise kadar her seti götürmek kuvvet veya hipertrofi için zorunlu görünmemektedir; hacim esitlendirilince anlamli üstünlük bulunmamistir ([2022 meta-analiz](https://pubmed.ncbi.nlm.nih.gov/33497853/)). Proximity-to-failure literatürü de anlik tükenisin hipertrofide üstünlügünü desteklemez ve iliskinin basit doğrusal olmayabilecegini belirtir ([2023 sistematik derleme ve meta-analiz](https://pubmed.ncbi.nlm.nih.gov/36334240/)).

Bu nedenle bot:

- Her sete otomatik `failure` yazmamali.
- Çaba bilgisi yoksa analizde “setlerin ne kadar zor bittigi bilinmiyor” demeli.
- Teknik bozulma, keskin agri veya riskli serbest agirlik hareketlerinde tükenisi tesvik etmemeli.
- RIR/RPE bilgisini kesin fiziksel ölçüm gibi degil, kullanici bildirimi olarak saklamali.

## 4. Progression, periyodizasyon ve deload

### 4.1 Progression

Yükü artirmak ve ayni yükle tekrar sayisini artirmak, egitimli bireylerde sekiz haftalik bir RCT'de kas büyümesi açisindan genel olarak benzer sonuçlar vermistir; yük artisi azami kuvvette küçük bir avantaj göstermistir ([2022 RCT](https://pubmed.ncbi.nlm.nih.gov/36199287/), [açik tam metin](https://pmc.ncbi.nlm.nih.gov/articles/PMC9528903/)). Bu nedenle bot sadece “her hafta kilo ekle” kuralina kilitlenmemelidir.

Önerilen deterministik progression sirasi:

1. Hedef tekrar araliginda tüm setler, kabul edilebilir teknik ve hedeflenen çaba ile tamamlandi mi?
2. Evetse önce küçük bir tekrar veya yük artisi öner.
3. Hayirsa ayni reçeteyi koru; performans düsüsü tekrarlaniyorsa uyku, stres, agri, seans süresi ve toplam hacmi sor.
4. Hareket ekipmani daha küçük yük artisina izin vermiyorsa tekrar artisini kullan.
5. Kullanici hedef araligin 1-2 tekrar üzerine çikabiliyorsa eski ACSM progresyon modeli yüzde 2-10 yük artisini önerir; bunu hareket, ekipman ve deneyime göre küçük uçtan baslayan bir aralik olarak kullan, zorunlu artis olarak degil ([ACSM progresyon pozisyon metni](https://pubmed.ncbi.nlm.nih.gov/11828249/)).

Hacim esit programlarda periyodizasyon azami kuvvette küçük avantaj gösterebilir; hipertrofide belirgin üstünlük göstermemistir. Dalgalı periyodizasyonun kuvvet avantaji özellikle egitimli alt grupta görülmüstür ([2022 sistematik derleme ve meta-analiz](https://pubmed.ncbi.nlm.nih.gov/35044672/)). Bu yüzden yeni baslayana karmaşik bloklar zorunlu tutulmamalidir.

### 4.2 Deload

Deload için güvenilir bilgi katmani üç kanit seviyesini ayirmalidir:

- `expert_consensus`: Egitim stresini geçici azaltarak fizyolojik/psikolojik yorgunlugu yönetme ve sonraki egitime hazirligi artirma amaci; tek standart protokol yok ([2023 Delphi](https://pubmed.ncbi.nlm.nih.gov/37730925/)).
- `randomized_trial_trained`: Dokuz haftalik program ortasinda bir hafta tamamen ara vermek hipertrofi, güç ve lokal dayanikliligi degistirmemis; sürekli egitim alt vücut kuvvetinde daha iyi olmustur ([2024 RCT](https://pubmed.ncbi.nlm.nih.gov/38274324/)).
- `randomized_within_subject_untrained`: 2026 tarihli küçük bir çalisma, egitimsiz genç erkeklerde frekans ve set azaltimli deload kosulunu incelemistir; dar örneklem nedeniyle genis nüfusa tek basina kural yazdirmamalidir ([2026 çalisma](https://pubmed.ncbi.nlm.nih.gov/41730991/)).

**Ürün karari:** Sabit “her dördüncü hafta deload” kuralı koyma. Üst üste performans düsüsü, artan yorgunluk, motivasyon kaybi, normalden uzun süren toparlanma ve yüksek birikmis yük gibi sinyaller varsa önce sorularla baglami tamamla. Agri veya tıbbi semptomu deload ile “tedavi etmeye” çalışma.

## 5. Set arasi ve seanslar arasi dinlenme

2024 sistematik derleme ve Bayesian meta-analiz, hipertrofi için 60 saniyenin üzerindeki dinlenmeler lehine küçük bir fayda olabilecegini; 90 saniyenin üzerinde ise belirgin ek fark yakalanmadigini bildirir. Muhtemel mekanizma daha uzun dinlenmeyle egitim hacmini koruyabilmektir ([2024 dinlenme meta-analizi](https://pubmed.ncbi.nlm.nih.gov/39205815/)). Eski ACSM progresyon metni agir kuvvet setlerinde en az 3 dakika, klasik hipertrofi odaginda 1-2 dakika gibi hedefe özgü araliklar sunar ([ACSM progresyon pozisyon metni](https://pubmed.ncbi.nlm.nih.gov/11828249/)).

Bot için deterministik baslangiç:

- Agir çok eklemli kuvvet setleri: performansi koruyacak daha uzun dinlenme.
- Orta yük hipertrofi setleri: sonraki sette hedef tekrar ve teknigi koruyacak kadar dinlenme; varsayilan kisa cevap 1-3 dakika olabilir.
- Izolasyon veya zaman kisitli seans: daha kisa dinlenme seçilebilir, fakat tekrar/teknik belirgin düsüyorsa uzatilir.
- Dinlenme süresi hedef degil araçtir; kullanici “nabzim hâlâ çok yüksek” veya olağandışı nefes darligi bildirirse süre optimizasyonu yerine güvenlik kapisi çalisir.

NSCA yeni baslayanlarda ayni kas gruplarini zorlayan full-body seanslarini ardışık olmayan 2-3 güne yerlestirmeyi önerir ([NSCA resmi egitim metni](https://www.nsca.com/education/articles/kinetic-select/determination-of-resistance-training-frequency/)). Ancak hacim esitliginde frekans sonuçlari benzer oldugundan, gelismis kullanicida günlük düzen gerçek hacim ve toparlanmayla birlikte degerlendirilmelidir ([frekans meta-analizi](https://pubmed.ncbi.nlm.nih.gov/30558493/)).

## 6. Güvenlik ve sakatlik sinirlari

ACSM'nin egzersiz öncesi tarama modeli; mevcut aktivite düzeyi, belirti/semptom veya bilinen kardiyovasküler-metabolik-böbrek hastaligi ve planlanan egzersiz siddetini birlikte kullanir ([ACSM tarama güncellemesi](https://pubmed.ncbi.nlm.nih.gov/26473759/)). Exercise is Medicine/ACSM tarama formu eforla gögüs rahatsizligi, makul olmayan nefes darligi, bas dönmesi/bayilma/blackout gibi belirtilerde egzersize baslamadan veya devam etmeden önce tıbbi onay alinmasini söyler ([resmi tarama formu](https://www.exerciseismedicine.org/wp-content/uploads/2021/04/EIM-exercise-preparticipation-screening.pdf)).

Botun katı güvenlik sinirlari:

- Tani koyma, yaralanma türü tahmin etme veya rehabilitasyon protokolü yazma.
- Eforla gögüs rahatsizligi, olağandışı nefes darligi, bayilma/bilinç kaybi, ciddi bas dönmesi veya bilinen hastalikla ilgili yeni belirti varsa program üretimini durdur ve uygun sağlık değerlendirmesine yönlendir ([ACSM/EIM tarama formu](https://www.exerciseismedicine.org/wp-content/uploads/2021/04/EIM-exercise-preparticipation-screening.pdf)).
- Ani ciddi agri, travma, belirgin sekil bozuklugu, nörolojik belirti veya hizla kötülesen durumlarda “alternatif hareket” vererek üzerini kapatma; acil/uygun saglik hizmetine yönlendir. Bu ikinci grup ürün güvenlik politikasidir, tıbbi tani kuralı degildir.
- Kronik veya tekrarlayan agri varsa semptomsuz genel egzersiz bilgisiyle sinirli kal; kisinin klinisyen/fizyoterapist planina uy.
- Çocuk, hamile, ileri yas, kronik hastalik, ameliyat sonrasi veya elit sporcu baglaminda saglikli yetiskin kurallarini otomatik kullanma.
- Güvenlik akışlarında mizah, iğneleme ve easter egg kullanma.

## 7. Mantik disi veya beklenmedik cevaplarda mizah

### 7.1 Önce anlami ayir

“Haftada kaç gün çalışıyorsun?” sorusuna `0` cevabi mantik disi degildir; kullanici su an antrenman yapmiyor olabilir. WHO ve ACSM önerisi iki gün olsa da, ACSM düzenli antrenmana hiç yoktan herhangi bir miktarla geçisin en büyük ilk kazanimi sagladigini ve uygulanabilir programin önemini vurgular ([ACSM 2026 infografik](https://www.acsm.org/wp-content/uploads/2026/03/Resistance-Training-Position-Stand-infographic.pdf)).

Bu nedenle iki farkli alan kullanilmalidir:

- `current_training_days`: `0..7` geçerli.
- `available_training_days_for_plan`: `1..7` program üretmek için geçerli; `0` gelirse kullanicinin baslamak isteyip istemedigi sorulur.

### 7.2 Deterministik mizah kurallari

| Girdi | Davranis | Örnek ton |
| --- | --- | --- |
| `0` mevcut gün | Profili 0 olarak kabul et, hedefi sor | “Kaslar şu an yıllık izinde 😄 Başlamak istiyorsan gerçekçi ilk hafta 1 mi 2 gün mü?” |
| `0` program için uygun gün | Hata deme; niyeti netlestir | “Takvim bize kapıyı kapattı 😄 En kısa uygulanabilir başlangıç için 1 gün ayırabilir misin?” |
| Negatif sayi | Girdiyi reddet, 0-7 araligini söyle | “Zaman makinesi setini henüz eklemedik 😄 Haftalık 0-7 arasında bir sayı yaz.” |
| `8` veya daha fazla | Girdiyi reddet, 1-7 araligini söyle | “Sekizinci günü bulduysan takvimi de spotlayalım 😄 Program için 1-7 gün seç.” |
| `31`, `365` | Haftalik/aylik karisikligini düzelt | “Bu haftalık program, maraton takvimi değil 😄 Bir haftada kaç gün ayırabilirsin?” |
| Anlamsiz metin | Bir kez kisa mizah, sonra kabul edilen format | “Dambıllar tercüme edemedi 😄 Sadece 0-7 arasında sayı yazabilirsin.” |
| Tekrarlanan geçersiz cevap | Mizahi tekrarlama; nötr ve kisa ol | “Haftalık gün sayısını 0-7 arasında sayı olarak yaz.” |

Kurallar:

1. Mizah, dogrulamadan sonra ayni mesajda dogru formati vermelidir.
2. Kullaniciya, kilosuna, görünümüne, deneyimsizligine veya sakatligina gülünmez.
3. Ayni easter egg bir oturumda en fazla bir kez kullanilir.
4. Kullanici sinirli/frustre ise mizah kapanir.
5. Agri, tıbbi semptom, yeme davranisi, beden algisi veya kriz baglaminda mizah kapanir.
6. Girdi dogrulamasi deterministik kalir; LLM yalnizca izin verilen ton varyantini seçer.

## 8. Önerilen makine-okunur veri modeli

Yayin metni yerine küçük, kaynakli bilgi nesneleri saklanmalidir. Asagidaki JSON biçimi tasarim önerisidir:

```json
{
  "schema_version": "1.0.0",
  "items": [
    {
      "id": "split.upper_lower",
      "kind": "split_pattern",
      "canonical_name": "upper_lower",
      "aliases": ["upper/lower", "üst-alt", "ust alt"],
      "parent_category": "split",
      "definition_tr": "Üst ve alt vücut hareketlerini farkli seanslara dagitan düzen.",
      "properties": {
        "minimum_distinct_sessions": 2,
        "typical_weekly_days": [2, 4],
        "assumed_muscle_frequency": null
      },
      "inference_policy": {
        "name_alone_is_sufficient": false,
        "required_user_fields": ["weekly_schedule"]
      },
      "claims": ["claim.split.volume_equated_equivalence"],
      "reviewed_at": "2026-07-15"
    }
  ],
  "claims": [
    {
      "id": "claim.split.volume_equated_equivalence",
      "statement_tr": "Hacim esit oldugunda full-body ve split rutinleri benzer kuvvet ve hipertrofi sonucu verir.",
      "population": "healthy_adults",
      "outcomes": ["strength", "hypertrophy"],
      "evidence_level": "systematic_review_meta_analysis",
      "confidence": "moderate",
      "source_ids": ["pmid.38595233"],
      "limitations_tr": "Split alt türlerinin veya her bireyin ayni sonucu alacagini göstermez."
    }
  ],
  "sources": [
    {
      "id": "pmid.38595233",
      "title": "Efficacy of Split Versus Full-Body Resistance Training on Strength and Muscle Growth",
      "organization_or_journal": "Journal of Strength and Conditioning Research",
      "year": 2024,
      "url": "https://pubmed.ncbi.nlm.nih.gov/38595233/",
      "doi": "10.1519/JSC.0000000000004774",
      "license": "publisher_copyright_check_required",
      "content_policy": "store_citation_and_original_summary_only"
    }
  ]
}
```

### 8.1 Gerekli varlik türleri

- `split_pattern`: Full-body, upper/lower, PPL, body-part, movement-pattern.
- `named_program`: PHAT, 5/3/1 gibi yaraticisi/sürümü olan program aileleri.
- `training_principle`: Hacim, frekans, yük, çaba, dinlenme, progression, periyodizasyon, deload.
- `safety_rule`: Belirti, kapsam disi grup, tıbbi yönlendirme ve mizah yasağı.
- `interaction_rule`: Gün sayisi dogrulama, belirsiz cevap, easter egg ve tekrar davranisi.
- `source`: URL, DOI/PMID, kurum/yayin, yil, kanit türü, lisans ve son kontrol tarihi.
- `claim`: Tek bir olgusal iddia, hedef nüfus, sonuç, kanit seviyesi, sinirlar ve kaynak baglantilari.

### 8.2 Program örnegi için normalize edilmis model

```json
{
  "program_id": "user-program-123",
  "declared_name": "Arnold split",
  "normalized_pattern": "body_part",
  "classification_confidence": 0.72,
  "weekly_days": 6,
  "days": [
    {
      "label": "Gün 1",
      "focus": ["chest", "back"],
      "exercises": []
    }
  ],
  "computed": {
    "direct_sets_per_muscle": {},
    "indirect_sets_per_muscle": {},
    "stimulus_days_per_muscle": {},
    "movement_pattern_coverage": {},
    "unknown_fields": ["effort", "rest_seconds", "progression_method"]
  }
}
```

`declared_name` yalnizca kullanicinin etiketi olarak kalir. Analiz `days`, `exercises`, `sets`, `reps`, `load`, `effort` ve `progression` üzerinden yapilir.

## 9. Deterministik motor ile LLM sorumluluk ayrimi

### 9.1 Deterministik kurallar

- Gün sayisini baglama göre `0..7` veya `1..7` dogrulama.
- Split alias normalizasyonu; belirsiz popüler adlarda gerçek programi isteme.
- Haftalik dogrudan/dolayli set, kas temas günü ve hareket örüntüsü hesaplama.
- WHO/ACSM iki günlük ana kas grubu tabanina göre eksik bilgi üretme; bunu “tek dogru split” diye sunmama.
- Hedefe göre yük/set/frekans için kaynakli araliklari seçme.
- Progression tetiklerini performans kaydindan hesaplama.
- Tükenisi zorunlu kilmama.
- Deloadu otomatik takvime degil, yorgunluk ve performans sinyallerine baglama.
- Güvenlik belirtilerinde üretimi durdurma ve yönlendirme.
- Mizah izin/yasak kosullari, easter egg tekrar sayaci ve geçerli girdi araligi.
- Her öneriye kullanilan `claim_id` ve `source_id` ekleme.

### 9.2 LLM görevleri

- Deterministik sonucun kisa, dogal ve kullanici seviyesine uygun açiklamasi.
- Eksik kritik alanlardan yalnizca birini siradaki soru olarak seçme.
- Izin verilen durumlarda kullanici tonuna uygun hafif mizah.
- “Neden full-body?”, “PPL kötü mü?” gibi sorularda ödünlesimleri açiklama.
- Kaynakli iddialari yeniden ifade etme; sayi, tani veya kaynak uydurmama.
- Bilgi katmaninin `limitations_tr` alanini gerekli olduğunda görünür kılma.

### 9.3 Hibrit akis

1. Parser kullanici programini normalize eder.
2. Validator eksik veya çeliski alanlari bulur.
3. Safety gate gerekiyorsa akisi durdurur.
4. Rule engine uygun bilgi iddialarini ve öneri adaylarini seçer.
5. LLM yalnizca seçilmis gerçekleri ve hesaplari konusma diline çevirir.
6. Çiktida iç denetim için `claim_ids`, `rule_ids` ve model sürümü loglanir; kullaniciya gereksiz teknik log gösterilmez.

## 10. Kaynak ve telif politikasi

1. Öncelik sirasi: güncel resmi pozisyon metni/kilavuz > sistematik derleme/meta-analiz > randomize kontrollü çalisma > uzman uzlasisi > yaraticinin program açiklamasi.
2. PubMed kaydi bir bibliyografik kaynak ve özet erisimidir; makalenin tam metnini yeniden kullanma lisansi anlamina gelmez. PMC de ücretsiz erisimin otomatik olarak yeniden kullanim izni vermedigini açikça belirtir ([PMC telif açiklamasi](https://pmc.ncbi.nlm.nih.gov/about/copyright/)).
3. Toplu metin kullanimi yalnizca makale bazinda lisans dogrulandiktan sonra yapilmalidir. PMC Open Access Subset, izin türüne göre ticari, ticari olmayan ve diger gruplari ayirir ([PMC OA Subset](https://pmc.ncbi.nlm.nih.gov/tools/openftlist/)).
4. WHO 2020 kilavuzu CC BY-NC-SA 3.0 IGO lisanslidir; ticari kullanim ve türev veri tasarimi ayrica lisans kosullarina göre degerlendirilmelidir ([WHO/NLM kitap kaydi ve lisans](https://www.ncbi.nlm.nih.gov/books/NBK566045/)).
5. ACSM sitesindeki içerigin telifli oldugu varsayilmalidir; izin yoksa metin veya görsel kopyalanmamalidir ([ACSM kullanim kosullari](https://acsm.org/terms-of-use/)).
6. FitZortNess veri tabaninda kaynaklardan kelimesi kelimesine paragraflar, tablolar veya görseller bulunmamalidir. Kendi kisa Türkçe özetimiz, yapisal olgular, kaynak baglantisi ve lisans metadatasi tutulmalidir.
7. PHAT ve 5/3/1 gibi programlarin tam reçeteleri yaratici kaynaklardan kopyalanmamalidir. Bot adi ve genel sinifi taniyabilir, ancak kullanici programi paylasmadikça telifli sablonu yeniden üretmemelidir ([Biolayne PHAT](https://biolayne.com/phat/), [Jim Wendler program katalogu](https://www.jimwendler.com/collections/books-programs)).

## 11. Uygulama sirasi önerisi

1. `knowledge/sources.json`, `knowledge/claims.json`, `knowledge/splits.json` ve JSON Schema dogrulamasi.
2. Split aliaslari ile `named_program` ayrimini yapan deterministik siniflandirici.
3. Program analizinin haftalik set, temas günü, hareket örüntüsü ve bilinmeyen alanlari hesaplamasi.
4. Gün sayisi için baglama duyarlı `0..7` / `1..7` dogrulama ve veri tabanli easter egg sablonlari.
5. Safety gate ve mizah yasağı testleri.
6. LLM promptuna yalnizca ilgili `claim` nesnelerini veren küçük retrieval katmani.
7. Her cevapta kullanilan kural/kaynak kimliklerinin telemetriye yazilmasi.
8. Kaynaklar için `reviewed_at`, `supersedes`, `license` ve yillik yeniden gözden geçirme akisi.

Bu siralama, hareket veri setini silip yerine dev bir metin koleksiyonu koymak yerine mevcut hareket katmanina küçük, denetlenebilir ve güncellenebilir bir programlama bilgisi katmani ekler.

## Kaynak dizini

- [ACSM 2026 Resistance Training Position Stand - PubMed](https://pubmed.ncbi.nlm.nih.gov/41843416/)
- [ACSM 2026 resmi özet infografik](https://www.acsm.org/wp-content/uploads/2026/03/Resistance-Training-Position-Stand-infographic.pdf)
- [WHO Guidelines on Physical Activity and Sedentary Behaviour](https://www.who.int/publications/i/item/9789240015128)
- [WHO kilavuz lisansi - NCBI Bookshelf](https://www.ncbi.nlm.nih.gov/books/NBK566045/)
- [NSCA: Determination of Resistance Training Frequency](https://www.nsca.com/education/articles/kinetic-select/determination-of-resistance-training-frequency/)
- [Split vs Full-Body sistematik derleme ve meta-analiz](https://pubmed.ncbi.nlm.nih.gov/38595233/)
- [Frekans ve hipertrofi sistematik derleme ve meta-analiz](https://pubmed.ncbi.nlm.nih.gov/30558493/)
- [Frekans ve kuvvet sistematik derleme ve meta-analiz](https://pubmed.ncbi.nlm.nih.gov/29470825/)
- [Direnç antrenmani reçeteleri Bayesian ag meta-analizi](https://pubmed.ncbi.nlm.nih.gov/37414459/)
- [Haftalik hacim doz-cevap meta-analizi](https://pubmed.ncbi.nlm.nih.gov/27433992/)
- [Tükenis vs tükenis olmayan antrenman meta-analizi](https://pubmed.ncbi.nlm.nih.gov/33497853/)
- [Tükenise yakinlik ve hipertrofi meta-analizi](https://pubmed.ncbi.nlm.nih.gov/36334240/)
- [Set arasi dinlenme ve hipertrofi meta-analizi](https://pubmed.ncbi.nlm.nih.gov/39205815/)
- [Yük veya tekrar artirarak progression RCT](https://pubmed.ncbi.nlm.nih.gov/36199287/)
- [Periyodizasyon sistematik derleme ve meta-analiz](https://pubmed.ncbi.nlm.nih.gov/35044672/)
- [Deload Delphi uzlasisi](https://pubmed.ncbi.nlm.nih.gov/37730925/)
- [Bir haftalik deload RCT](https://pubmed.ncbi.nlm.nih.gov/38274324/)
- [ACSM egzersiz öncesi tarama güncellemesi](https://pubmed.ncbi.nlm.nih.gov/26473759/)
- [Exercise is Medicine / ACSM tarama formu](https://www.exerciseismedicine.org/wp-content/uploads/2021/04/EIM-exercise-preparticipation-screening.pdf)
- [PHAT yaratici kaynagi](https://biolayne.com/articles/training/phat-power-hypertrophy-adaptive-training/)
- [5/3/1 yaratici program katalogu](https://www.jimwendler.com/collections/books-programs)
- [NIH/PMC telif politikasi](https://pmc.ncbi.nlm.nih.gov/about/copyright/)
- [PMC Open Access Subset](https://pmc.ncbi.nlm.nih.gov/tools/openftlist/)
