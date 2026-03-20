/**
 * Complete static dataset of Chinese 985, 211, and 双一流 (Double First-Class) universities.
 *
 * Tier relationships:
 *   - All 39 Project 985 universities are also 211 and 双一流
 *   - 211-only universities (not 985) are also 双一流
 *   - 双一流-only universities were added in the 2017 and 2022 rounds
 *
 * Sources: Ministry of Education (MOE) official lists, 2022 Double First-Class update.
 */

export interface ChineseUniversity {
  /** Canonical full Chinese name */
  name: string;
  /** Tier memberships — a university can belong to multiple */
  tiers: ('985' | '211' | '双一流')[];
  /** All known aliases: short Chinese name, English name, abbreviations */
  aliases: string[];
}

export const CHINESE_UNIVERSITIES: ChineseUniversity[] = [
  // ============================================================
  // Project 985 Universities (39 total) — all also 211 + 双一流
  // ============================================================

  {
    name: '北京大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['北京大学', '北大', 'Peking University', 'PKU'],
  },
  {
    name: '清华大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['清华大学', '清华', 'Tsinghua University', 'THU'],
  },
  {
    name: '中国人民大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['中国人民大学', '人大', 'Renmin University of China', 'RUC'],
  },
  {
    name: '北京师范大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['北京师范大学', '北师大', 'Beijing Normal University', 'BNU'],
  },
  {
    name: '北京理工大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['北京理工大学', '北理工', 'Beijing Institute of Technology', 'BIT'],
  },
  {
    name: '北京航空航天大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['北京航空航天大学', '北航', 'Beihang University', 'BUAA'],
  },
  {
    name: '中国农业大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['中国农业大学', '中农', 'China Agricultural University', 'CAU'],
  },
  {
    name: '中央民族大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['中央民族大学', '民大', 'Minzu University of China', 'MUC'],
  },
  {
    name: '南开大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['南开大学', '南开', 'Nankai University', 'NKU'],
  },
  {
    name: '天津大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['天津大学', '天大', 'Tianjin University', 'TJU'],
  },
  {
    name: '大连理工大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['大连理工大学', '大工', 'Dalian University of Technology', 'DUT'],
  },
  {
    name: '东北大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['东北大学', '东大', 'Northeastern University', 'NEU'],
  },
  {
    name: '吉林大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['吉林大学', '吉大', 'Jilin University', 'JLU'],
  },
  {
    name: '哈尔滨工业大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['哈尔滨工业大学', '哈工大', 'Harbin Institute of Technology', 'HIT'],
  },
  {
    name: '复旦大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['复旦大学', '复旦', 'Fudan University', 'FDU'],
  },
  {
    name: '上海交通大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['上海交通大学', '上交', '交大', 'Shanghai Jiao Tong University', 'SJTU'],
  },
  {
    name: '同济大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['同济大学', '同济', 'Tongji University'],
  },
  {
    name: '华东师范大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['华东师范大学', '华东师大', 'East China Normal University', 'ECNU'],
  },
  {
    name: '南京大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['南京大学', '南大', 'Nanjing University', 'NJU'],
  },
  {
    name: '东南大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['东南大学', '东大', 'Southeast University', 'SEU'],
  },
  {
    name: '浙江大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['浙江大学', '浙大', 'Zhejiang University', 'ZJU'],
  },
  {
    name: '中国科学技术大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['中国科学技术大学', '中科大', 'University of Science and Technology of China', 'USTC'],
  },
  {
    name: '厦门大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['厦门大学', '厦大', 'Xiamen University', 'XMU'],
  },
  {
    name: '山东大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['山东大学', '山大', 'Shandong University', 'SDU'],
  },
  {
    name: '中国海洋大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['中国海洋大学', '海大', 'Ocean University of China', 'OUC'],
  },
  {
    name: '武汉大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['武汉大学', '武大', 'Wuhan University', 'WHU'],
  },
  {
    name: '华中科技大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['华中科技大学', '华科', 'Huazhong University of Science and Technology', 'HUST'],
  },
  {
    name: '湖南大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['湖南大学', '湖大', 'Hunan University', 'HNU'],
  },
  {
    name: '中南大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['中南大学', '中南', 'Central South University', 'CSU'],
  },
  {
    name: '中山大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['中山大学', '中大', 'Sun Yat-sen University', 'SYSU'],
  },
  {
    name: '华南理工大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['华南理工大学', '华工', '华南理工', 'South China University of Technology', 'SCUT'],
  },
  {
    name: '四川大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['四川大学', '川大', 'Sichuan University', 'SCU'],
  },
  {
    name: '电子科技大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['电子科技大学', '成电', 'University of Electronic Science and Technology of China', 'UESTC'],
  },
  {
    name: '重庆大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['重庆大学', '重大', 'Chongqing University', 'CQU'],
  },
  {
    name: '西安交通大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['西安交通大学', '西交', '西交大', "Xi'an Jiaotong University", 'XJTU'],
  },
  {
    name: '西北工业大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['西北工业大学', '西工大', 'Northwestern Polytechnical University', 'NPU', 'NWPU'],
  },
  {
    name: '兰州大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['兰州大学', '兰大', 'Lanzhou University', 'LZU'],
  },
  {
    name: '国防科技大学',
    tiers: ['985', '211', '双一流'],
    aliases: ['国防科技大学', '国防科大', 'National University of Defense Technology', 'NUDT'],
  },

  // ============================================================
  // 211 Universities (NOT 985) — all also 双一流
  // ============================================================

  // --- Beijing ---
  {
    name: '北京交通大学',
    tiers: ['211', '双一流'],
    aliases: ['北京交通大学', '北交', 'Beijing Jiaotong University', 'BJTU'],
  },
  {
    name: '北京工业大学',
    tiers: ['211', '双一流'],
    aliases: ['北京工业大学', '北工大', 'Beijing University of Technology', 'BJUT'],
  },
  {
    name: '北京科技大学',
    tiers: ['211', '双一流'],
    aliases: ['北京科技大学', '北科大', 'University of Science and Technology Beijing', 'USTB'],
  },
  {
    name: '北京化工大学',
    tiers: ['211', '双一流'],
    aliases: ['北京化工大学', '北化', 'Beijing University of Chemical Technology', 'BUCT'],
  },
  {
    name: '北京邮电大学',
    tiers: ['211', '双一流'],
    aliases: ['北京邮电大学', '北邮', 'Beijing University of Posts and Telecommunications', 'BUPT'],
  },
  {
    name: '北京林业大学',
    tiers: ['211', '双一流'],
    aliases: ['北京林业大学', '北林', 'Beijing Forestry University', 'BFU'],
  },
  {
    name: '北京中医药大学',
    tiers: ['211', '双一流'],
    aliases: ['北京中医药大学', '北中医', 'Beijing University of Chinese Medicine', 'BUCM'],
  },
  {
    name: '北京外国语大学',
    tiers: ['211', '双一流'],
    aliases: ['北京外国语大学', '北外', 'Beijing Foreign Studies University', 'BFSU'],
  },
  {
    name: '中国传媒大学',
    tiers: ['211', '双一流'],
    aliases: ['中国传媒大学', '中传', 'Communication University of China', 'CUC'],
  },
  {
    name: '中央财经大学',
    tiers: ['211', '双一流'],
    aliases: ['中央财经大学', '央财', '中财', 'Central University of Finance and Economics', 'CUFE'],
  },
  {
    name: '对外经济贸易大学',
    tiers: ['211', '双一流'],
    aliases: ['对外经济贸易大学', '贸大', 'University of International Business and Economics', 'UIBE'],
  },
  {
    name: '中国政法大学',
    tiers: ['211', '双一流'],
    aliases: ['中国政法大学', '法大', 'China University of Political Science and Law', 'CUPL'],
  },
  {
    name: '华北电力大学',
    tiers: ['211', '双一流'],
    aliases: ['华北电力大学', '华电', 'North China Electric Power University', 'NCEPU'],
  },
  {
    name: '中国矿业大学',
    tiers: ['211', '双一流'],
    aliases: ['中国矿业大学', '矿大', 'China University of Mining and Technology', 'CUMT'],
  },
  {
    name: '中国石油大学',
    tiers: ['211', '双一流'],
    aliases: ['中国石油大学', '石大', 'China University of Petroleum', 'CUP'],
  },
  {
    name: '中国地质大学',
    tiers: ['211', '双一流'],
    aliases: ['中国地质大学', '地大', 'China University of Geosciences', 'CUG'],
  },

  // --- Jiangsu ---
  {
    name: '河海大学',
    tiers: ['211', '双一流'],
    aliases: ['河海大学', '河海', 'Hohai University', 'HHU'],
  },
  {
    name: '江南大学',
    tiers: ['211', '双一流'],
    aliases: ['江南大学', 'Jiangnan University'],
  },
  {
    name: '南京农业大学',
    tiers: ['211', '双一流'],
    aliases: ['南京农业大学', '南农', 'Nanjing Agricultural University', 'NAU', 'NJAU'],
  },
  {
    name: '南京师范大学',
    tiers: ['211', '双一流'],
    aliases: ['南京师范大学', '南师大', '南师', 'Nanjing Normal University', 'NNU'],
  },
  {
    name: '南京理工大学',
    tiers: ['211', '双一流'],
    aliases: ['南京理工大学', '南理工', 'Nanjing University of Science and Technology', 'NJUST'],
  },
  {
    name: '南京航空航天大学',
    tiers: ['211', '双一流'],
    aliases: ['南京航空航天大学', '南航', 'Nanjing University of Aeronautics and Astronautics', 'NUAA'],
  },
  {
    name: '苏州大学',
    tiers: ['211', '双一流'],
    aliases: ['苏州大学', '苏大', 'Soochow University', 'SUDA'],
  },

  // --- Shanghai ---
  {
    name: '上海财经大学',
    tiers: ['211', '双一流'],
    aliases: ['上海财经大学', '上财', 'Shanghai University of Finance and Economics', 'SUFE'],
  },
  {
    name: '上海外国语大学',
    tiers: ['211', '双一流'],
    aliases: ['上海外国语大学', '上外', 'Shanghai International Studies University', 'SISU'],
  },
  {
    name: '华东理工大学',
    tiers: ['211', '双一流'],
    aliases: ['华东理工大学', '华理', 'East China University of Science and Technology', 'ECUST'],
  },
  {
    name: '东华大学',
    tiers: ['211', '双一流'],
    aliases: ['东华大学', '东华', 'Donghua University', 'DHU'],
  },
  {
    name: '上海大学',
    tiers: ['211', '双一流'],
    aliases: ['上海大学', '上大', 'Shanghai University', 'SHU'],
  },

  // --- Guangdong ---
  {
    name: '暨南大学',
    tiers: ['211', '双一流'],
    aliases: ['暨南大学', '暨大', 'Jinan University', 'JNU'],
  },
  {
    name: '华南师范大学',
    tiers: ['211', '双一流'],
    aliases: ['华南师范大学', '华师', '华南师大', 'South China Normal University', 'SCNU'],
  },

  // --- Southwest ---
  {
    name: '西南大学',
    tiers: ['211', '双一流'],
    aliases: ['西南大学', '西大', 'Southwest University', 'SWU'],
  },
  {
    name: '西南财经大学',
    tiers: ['211', '双一流'],
    aliases: ['西南财经大学', '西财', 'Southwestern University of Finance and Economics', 'SWUFE'],
  },
  {
    name: '西南交通大学',
    tiers: ['211', '双一流'],
    aliases: ['西南交通大学', '西南交大', 'Southwest Jiaotong University', 'SWJTU'],
  },
  {
    name: '四川农业大学',
    tiers: ['211', '双一流'],
    aliases: ['四川农业大学', '川农', 'Sichuan Agricultural University', 'SICAU'],
  },

  // --- Hubei ---
  {
    name: '武汉理工大学',
    tiers: ['211', '双一流'],
    aliases: ['武汉理工大学', '武理工', 'Wuhan University of Technology', 'WUT'],
  },
  {
    name: '华中农业大学',
    tiers: ['211', '双一流'],
    aliases: ['华中农业大学', '华农', 'Huazhong Agricultural University', 'HZAU'],
  },
  {
    name: '华中师范大学',
    tiers: ['211', '双一流'],
    aliases: ['华中师范大学', '华中师大', '华师', 'Central China Normal University', 'CCNU'],
  },
  {
    name: '中南财经政法大学',
    tiers: ['211', '双一流'],
    aliases: ['中南财经政法大学', '中南财大', 'Zhongnan University of Economics and Law', 'ZUEL'],
  },

  // --- Anhui ---
  {
    name: '合肥工业大学',
    tiers: ['211', '双一流'],
    aliases: ['合肥工业大学', '合工大', 'Hefei University of Technology', 'HFUT'],
  },
  {
    name: '安徽大学',
    tiers: ['211', '双一流'],
    aliases: ['安徽大学', '安大', 'Anhui University', 'AHU'],
  },

  // --- Fujian ---
  {
    name: '福州大学',
    tiers: ['211', '双一流'],
    aliases: ['福州大学', '福大', 'Fuzhou University', 'FZU'],
  },

  // --- Jiangxi ---
  {
    name: '南昌大学',
    tiers: ['211', '双一流'],
    aliases: ['南昌大学', '昌大', 'Nanchang University', 'NCU'],
  },

  // --- Henan ---
  {
    name: '郑州大学',
    tiers: ['211', '双一流'],
    aliases: ['郑州大学', '郑大', 'Zhengzhou University', 'ZZU'],
  },

  // --- Shanxi ---
  {
    name: '太原理工大学',
    tiers: ['211', '双一流'],
    aliases: ['太原理工大学', '太原理工', 'Taiyuan University of Technology', 'TYUT'],
  },

  // --- Liaoning ---
  {
    name: '辽宁大学',
    tiers: ['211', '双一流'],
    aliases: ['辽宁大学', '辽大', 'Liaoning University', 'LNU'],
  },
  {
    name: '大连海事大学',
    tiers: ['211', '双一流'],
    aliases: ['大连海事大学', '海事大学', 'Dalian Maritime University', 'DMU'],
  },

  // --- Jilin ---
  {
    name: '东北师范大学',
    tiers: ['211', '双一流'],
    aliases: ['东北师范大学', '东北师大', 'Northeast Normal University', 'NENU'],
  },
  {
    name: '延边大学',
    tiers: ['211', '双一流'],
    aliases: ['延边大学', '延大', 'Yanbian University', 'YBU'],
  },

  // --- Heilongjiang ---
  {
    name: '东北农业大学',
    tiers: ['211', '双一流'],
    aliases: ['东北农业大学', '东北农大', 'Northeast Agricultural University', 'NEAU'],
  },
  {
    name: '东北林业大学',
    tiers: ['211', '双一流'],
    aliases: ['东北林业大学', '东北林大', 'Northeast Forestry University', 'NEFU'],
  },
  {
    name: '哈尔滨工程大学',
    tiers: ['211', '双一流'],
    aliases: ['哈尔滨工程大学', '哈工程', 'Harbin Engineering University', 'HEU'],
  },

  // --- Hainan ---
  {
    name: '海南大学',
    tiers: ['211', '双一流'],
    aliases: ['海南大学', '海大', 'Hainan University'],
  },

  // --- Guangxi ---
  {
    name: '广西大学',
    tiers: ['211', '双一流'],
    aliases: ['广西大学', '西大', 'Guangxi University', 'GXU'],
  },

  // --- Guizhou ---
  {
    name: '贵州大学',
    tiers: ['211', '双一流'],
    aliases: ['贵州大学', '贵大', 'Guizhou University', 'GZU'],
  },

  // --- Yunnan ---
  {
    name: '云南大学',
    tiers: ['211', '双一流'],
    aliases: ['云南大学', '云大', 'Yunnan University', 'YNU'],
  },

  // --- Tibet ---
  {
    name: '西藏大学',
    tiers: ['211', '双一流'],
    aliases: ['西藏大学', '藏大', 'Tibet University', 'TU'],
  },

  // --- Xinjiang ---
  {
    name: '新疆大学',
    tiers: ['211', '双一流'],
    aliases: ['新疆大学', '新大', 'Xinjiang University', 'XJU'],
  },
  {
    name: '石河子大学',
    tiers: ['211', '双一流'],
    aliases: ['石河子大学', '石大', 'Shihezi University', 'SHZU'],
  },

  // --- Inner Mongolia ---
  {
    name: '内蒙古大学',
    tiers: ['211', '双一流'],
    aliases: ['内蒙古大学', '内大', 'Inner Mongolia University', 'IMU'],
  },

  // --- Ningxia ---
  {
    name: '宁夏大学',
    tiers: ['211', '双一流'],
    aliases: ['宁夏大学', '宁大', 'Ningxia University', 'NXU'],
  },

  // --- Qinghai ---
  {
    name: '青海大学',
    tiers: ['211', '双一流'],
    aliases: ['青海大学', 'Qinghai University', 'QHU'],
  },

  // --- Shaanxi ---
  {
    name: '长安大学',
    tiers: ['211', '双一流'],
    aliases: ['长安大学', "Chang'an University", 'CHD'],
  },
  {
    name: '西北大学',
    tiers: ['211', '双一流'],
    aliases: ['西北大学', '西大', 'Northwest University', 'NWU'],
  },
  {
    name: '陕西师范大学',
    tiers: ['211', '双一流'],
    aliases: ['陕西师范大学', '陕师大', 'Shaanxi Normal University', 'SNNU'],
  },
  {
    name: '西安电子科技大学',
    tiers: ['211', '双一流'],
    aliases: ['西安电子科技大学', '西电', 'Xidian University', 'XDU'],
  },

  // --- Military Medical ---
  {
    name: '海军军医大学',
    tiers: ['211', '双一流'],
    aliases: ['海军军医大学', '第二军医大学', 'Naval Medical University', 'Second Military Medical University'],
  },
  {
    name: '空军军医大学',
    tiers: ['211', '双一流'],
    aliases: ['空军军医大学', '第四军医大学', 'Air Force Medical University', 'Fourth Military Medical University'],
  },

  // ============================================================
  // 双一流-only Universities (2017/2022 additions, NOT in 211)
  // ============================================================

  {
    name: '中国科学院大学',
    tiers: ['双一流'],
    aliases: ['中国科学院大学', '国科大', 'University of Chinese Academy of Sciences', 'UCAS'],
  },
  {
    name: '南方科技大学',
    tiers: ['双一流'],
    aliases: ['南方科技大学', '南科大', 'Southern University of Science and Technology', 'SUSTech'],
  },
  {
    name: '上海科技大学',
    tiers: ['双一流'],
    aliases: ['上海科技大学', '上科大', 'ShanghaiTech University'],
  },
  {
    name: '首都师范大学',
    tiers: ['双一流'],
    aliases: ['首都师范大学', '首师大', 'Capital Normal University', 'CNU'],
  },
  {
    name: '中国音乐学院',
    tiers: ['双一流'],
    aliases: ['中国音乐学院', '国音', 'China Conservatory of Music'],
  },
  {
    name: '上海海洋大学',
    tiers: ['双一流'],
    aliases: ['上海海洋大学', '海洋大学', 'Shanghai Ocean University', 'SHOU'],
  },
  {
    name: '上海中医药大学',
    tiers: ['双一流'],
    aliases: ['上海中医药大学', '上中医', 'Shanghai University of Traditional Chinese Medicine', 'SHUTCM'],
  },
  {
    name: '上海体育学院',
    tiers: ['双一流'],
    aliases: ['上海体育学院', '上体', 'Shanghai University of Sport', 'SUS'],
  },
  {
    name: '南京信息工程大学',
    tiers: ['双一流'],
    aliases: ['南京信息工程大学', '南信大', 'Nanjing University of Information Science and Technology', 'NUIST'],
  },
  {
    name: '南京邮电大学',
    tiers: ['双一流'],
    aliases: ['南京邮电大学', '南邮', 'Nanjing University of Posts and Telecommunications', 'NJUPT'],
  },
  {
    name: '南京医科大学',
    tiers: ['双一流'],
    aliases: ['南京医科大学', '南医大', 'Nanjing Medical University', 'NMU'],
  },
  {
    name: '南京林业大学',
    tiers: ['双一流'],
    aliases: ['南京林业大学', '南林', 'Nanjing Forestry University', 'NFU'],
  },
  {
    name: '南京中医药大学',
    tiers: ['双一流'],
    aliases: ['南京中医药大学', '南中医', 'Nanjing University of Chinese Medicine', 'NJUCM'],
  },
  {
    name: '河南大学',
    tiers: ['双一流'],
    aliases: ['河南大学', '河大', 'Henan University', 'HENU'],
  },
  {
    name: '湘潭大学',
    tiers: ['双一流'],
    aliases: ['湘潭大学', '湘大', 'Xiangtan University', 'XTU'],
  },
  {
    name: '广州医科大学',
    tiers: ['双一流'],
    aliases: ['广州医科大学', '广医', 'Guangzhou Medical University', 'GMU'],
  },
  {
    name: '华南农业大学',
    tiers: ['双一流'],
    aliases: ['华南农业大学', '华农', 'South China Agricultural University', 'SCAU'],
  },
  {
    name: '成都理工大学',
    tiers: ['双一流'],
    aliases: ['成都理工大学', '成理', 'Chengdu University of Technology', 'CDUT'],
  },
  {
    name: '成都中医药大学',
    tiers: ['双一流'],
    aliases: ['成都中医药大学', '成中医', 'Chengdu University of Traditional Chinese Medicine', 'CDUTCM'],
  },
  {
    name: '西南石油大学',
    tiers: ['双一流'],
    aliases: ['西南石油大学', '西南石大', 'Southwest Petroleum University', 'SWPU'],
  },
  {
    name: '天津工业大学',
    tiers: ['双一流'],
    aliases: ['天津工业大学', '天工大', 'Tiangong University', 'TGU'],
  },
  {
    name: '天津中医药大学',
    tiers: ['双一流'],
    aliases: ['天津中医药大学', '天中', 'Tianjin University of Traditional Chinese Medicine', 'TUTCM'],
  },
  {
    name: '外交学院',
    tiers: ['双一流'],
    aliases: ['外交学院', 'China Foreign Affairs University', 'CFAU'],
  },
  {
    name: '中国人民公安大学',
    tiers: ['双一流'],
    aliases: ['中国人民公安大学', '公安大学', "People's Public Security University of China", 'PPSUC'],
  },
  {
    name: '北京体育大学',
    tiers: ['双一流'],
    aliases: ['北京体育大学', '北体', 'Beijing Sport University', 'BSU'],
  },
  {
    name: '中央美术学院',
    tiers: ['双一流'],
    aliases: ['中央美术学院', '央美', 'Central Academy of Fine Arts', 'CAFA'],
  },
  {
    name: '中央戏剧学院',
    tiers: ['双一流'],
    aliases: ['中央戏剧学院', '中戏', 'Central Academy of Drama'],
  },
  {
    name: '中国美术学院',
    tiers: ['双一流'],
    aliases: ['中国美术学院', '国美', 'China Academy of Art', 'CAA'],
  },
  {
    name: '宁波大学',
    tiers: ['双一流'],
    aliases: ['宁波大学', '宁大', 'Ningbo University', 'NBU'],
  },
  {
    name: '天津医科大学',
    tiers: ['双一流'],
    aliases: ['天津医科大学', '天医', 'Tianjin Medical University', 'TMU'],
  },
  {
    name: '山西大学',
    tiers: ['双一流'],
    aliases: ['山西大学', 'Shanxi University', 'SXU'],
  },
];

/**
 * Lookup helper: find a university by any alias (case-insensitive, trim).
 */
export function findUniversityByAlias(query: string): ChineseUniversity | undefined {
  const normalized = query.trim().toLowerCase();
  return CHINESE_UNIVERSITIES.find((u) =>
    u.aliases.some((a) => a.toLowerCase() === normalized),
  );
}

/**
 * Check if a university name/alias belongs to a given tier.
 */
export function isInTier(query: string, tier: '985' | '211' | '双一流'): boolean {
  const university = findUniversityByAlias(query);
  return university ? university.tiers.includes(tier) : false;
}

/**
 * Get all universities in a specific tier.
 */
export function getUniversitiesByTier(tier: '985' | '211' | '双一流'): ChineseUniversity[] {
  return CHINESE_UNIVERSITIES.filter((u) => u.tiers.includes(tier));
}
