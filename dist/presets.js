import { tr, getLocale } from './i18n.js';

export const PRESETS = [
 {id:'generic',name:tr('通用表格','General tables'),icon:'table',description:tr('从字段类型开始，自由配置清洗规则','Choose field types and configure your cleaning rules'),hint:tr('适用于各类系统导出的表格。按实际内容确认字段类型，再选择重复依据。','For tables exported from any system. Confirm field types from their contents, then choose duplicate keys.')},
 {id:'customer',name:tr('客户资料','Customer records'),icon:'people',description:tr('客户信息规范化，重复与缺失检查','Normalize contact details and check duplicates and missing values'),hint:tr('优先按客户编号检查重复。共用电话的联系人可能是不同记录，请确认去重依据。','Use Customer ID first. Contacts sharing a phone number can be separate records, so confirm the duplicate key.')},
 {id:'education',name:tr('教育 · 学员名册','Education · Student roster'),icon:'education',description:tr('保留学号，规范联系方式与报名日期','Preserve student IDs and normalize contact details and enrollment dates'),hint:tr('报名或选课表建议按学号＋课程检查重复；一人一行的学员表可以仅选择学号。','For enrollment or course-selection tables, check duplicates by Student ID + Course. A roster with one row per student may use Student ID alone.')},
 {id:'product',name:tr('商品资料','Product catalog'),icon:'box',description:tr('保护商品编码，检查价格与规格数据','Preserve product codes and check prices and variants'),hint:tr('商品编码按文本保留。相同编码但规格不同会列为冲突，需按商品业务规则确认。','Keep product codes as text. Matching codes with different variants are flagged as conflicts; review them using your product rules.')}
];
export const TYPES = {
 text:tr('普通文本','Text'),
 id:tr('编号 / 保留前导零','Identifier / preserve leading zeros'),
 phone:tr('大陆手机号','Mainland China mobile number'),
 email:tr('邮箱','Email'),
 date:tr('日期','Date'),
 number:tr('数值 / 金额','Number / amount')
};
export const TYPE_MARKS={text:'T',id:'#',phone:'☎',email:'@',date:'D',number:'№'};
export const BASE_RULES=[
 {key:'trim',title:tr('去除首尾空白','Trim leading and trailing whitespace'),note:tr('保留内容中的空格和换行','Keep spaces and line breaks inside values')},
 {key:'normalizePhone',title:tr('规范手机号','Normalize mobile numbers'),note:tr('处理大陆号码的空格与区号','Remove spaces and Mainland China dialing prefixes')},
 {key:'normalizeEmail',title:tr('规范邮箱域名','Normalize email domains'),note:tr('只将 @ 后的域名转为小写','Lowercase only the domain after @')},
 {key:'normalizeDate',title:tr('统一日期格式','Normalize date format'),note:tr('仅转换含义明确的日期','Convert only unambiguous dates')},
 {key:'normalizeNumber',title:tr('规范数值格式','Normalize numbers'),note:tr('去掉合法千分位，保留精度','Remove valid thousands separators; retain precision')},
 {key:'dropEmptyRows',title:tr('移除全空行','Remove blank rows'),note:tr('空白行计入移除清单','Include blank rows in the removal audit')},
 {key:'normalizeWidth',title:tr('全角字符转半角','Convert fullwidth to halfwidth'),note:tr('仅转换全角英数符号和空格','Only fullwidth ASCII letters, digits, punctuation, and spaces')}
];
export const EXAMPLES={
 education:{name:'学员报名表_示例.csv',headers:['学号','姓名','课程','手机号','邮箱','报名日期','报名金额'],rows:[
 ['0001',' 林予安 ','Python 基础','+86 138-0000-0001','Lin@EXAMPLE.COM','2026/09/01','1,280.00'],
 ['0002','陈子墨','UI 设计','139 0000 0002','chen@example.com','2026年9月2日','980.00'],
 ['0003','周星禾','数据分析','13700000003','zhou.example.com','2026-09-04','1,680.00'],
 ['0004','','Python 基础','13600000004','student4@example.com','2026.9.5','1,280.00'],
 ['0005','许清越','数据分析','13500000005','xu@example.com','2026-09-06','1680.00'],
 ['0006','沈知夏','UI 设计','13400000006','shen@EXAMPLE.COM','2026/09/06','980.00'],
 ['0002','陈子墨','UI 设计','13900000002','chen@example.com','2026-09-02','980.00'],
 ['0007','顾一然','Python 基础','1380007','gu@example.com','2026/09/07','1280.00'],
 ['0001','林予安','Python 进阶','13800000001','Lin@example.com','2026/09/08','1,880.00'],
 ['0008','宋听澜','UI 设计','13800000008','song@example.com','09/10/2026','980.00'],
 ['0009','陆予宁','数据分析','13800000009','lu@example.com','2026/09/10','1,68.00'],
 ['0010',' 何书言 ','Python 基础','0086 13800000010','he@example.com','2026年9月11日','1280.00'],
 ['0005','许清越','数据分析','13800000055','xu@example.com','2026-09-06','1680.00'],
 ['0011','苏景和','UI 设计','13800000011','su@example.com','2026-09-12','980.00'],
 ['','唐沐白','Python 基础','13800000012','tang@example.com','2026-09-13','1280.00'],
 ['0013','温时雨','数据分析','13800000013','wen@example.com','2026-09-14','1680.00'],
 ['0014','叶知远','UI 设计','13800000014','ye@Example.com','2026/09/15','980.00'],
 ['0015','江望舒','Python 基础','13800000015','jiang@example.com','2026-09-16','1280.00'],
 ['0016','白予桐','Python 进阶','13800000016','bai@example.com','2026-02-30','1880.00'],
 ['','','','','','','']
 ],requirements:'学号保留前导零；\n姓名和学号必填；\n按学号+课程检查重复；\n手机号去掉空格和 +86；\n报名日期统一为 YYYY-MM-DD。'},
 customer:{name:'客户资料_示例.csv',headers:['客户编号','客户名称','联系人','手机号','邮箱','创建日期','地区'],rows:[
 ['C001',' 云起科技 ','陈一鸣','+86 13800001001','Chen@EXAMPLE.COM','2026/09/01','北京市'],
 ['C002','明远教育','林若溪','139 0000 1002','lin@example.com','2026年9月2日','上海市'],
 ['C003','禾木设计','周清','13700001003','zhou.example.com','2026-09-03','杭州市'],
 ['C001','云起科技','陈一鸣','13800001001','Chen@example.com','2026-09-01','北京市'],
 ['C004','见山工作室','','13600001004','studio@example.com','2026-09-04','成都市'],
 ['C002','明远教育','林若溪','13900001999','lin@example.com','2026-09-02','上海市'],
 ['C005','知行商贸','叶舒','13500001005','ye@EXAMPLE.COM','2026/09/05','深圳市'],
 ['C006','青禾文化','宋宁','12345','song@example.com','09/06/2026','南京市'],
 ['C007','星川咨询','夏知','13400001007','','2026-09-07','苏州市'],
 ['C008','清风科技','陆遥','13800001008','lu@example.com','2026-09-08','北京市']
 ],requirements:'去除所有字段首尾空格；\n客户编号和客户名称必填；\n按客户编号检查重复；\n邮箱域名转小写。'},
 product:{name:'商品目录_示例.csv',headers:['商品编码','商品名称','规格','单位','单价','上架日期'],rows:[
 ['000101',' 纯棉 T 恤 ','M / 白色','件','128.00','2026/09/01'],
 ['000102','帆布包','标准款','个','1,280.00','2026年9月2日'],
 ['000103','陶瓷杯','350 mL','个','68.00','2026-09-03'],
 ['000101','纯棉 T 恤','M / 白色','件','128.00','2026-09-01'],
 ['000103','陶瓷杯','500 mL','个','88.00','2026-09-03'],
 ['000104','笔记本','A5','本','2,9.00','2026-09-04'],
 ['000105','','L / 黑色','件','158.00','2026/09/05'],
 ['000106','收纳盒','大号','个','59.90','05/09/2026'],
 ['000107','桌面灯','暖光','台','299.00','2026-09-06'],
 ['000108','书立','金属','对','-12.50','2026-09-07']
 ],requirements:'商品编码保留前导零；\n商品编码和商品名称必填；\n按商品编码检查重复；\n单价去除千分位；\n上架日期统一为 YYYY-MM-DD。'},
 generic:{name:'通用表格_示例.csv',headers:['记录编号','名称','邮箱','日期','数量'],rows:[
 ['001',' 林间项目 ','Project@EXAMPLE.COM','2026/09/01','1,000'],
 ['002','山海计划','team@example.com','2026年9月2日','50'],
 ['003','青禾小组','team.example.com','2026-09-03','20'],
 ['001','林间项目','Project@example.com','2026-09-01','1000'],
 ['004','云川工作室','cloud@example.com','03/04/2026','10'],
 ['005','晨光计划','morning@example.com','2026-09-05','1,2'],
 ['006','星河小组','','2026-09-06','0'],
 ['007',' 竹影计划 ','green@Example.com','2026/09/07','30']
 ],requirements:'去除首尾空白；\n记录编号保留前导零；\n按记录编号检查重复；\n日期统一为 YYYY-MM-DD。'}
};

/** Independent fictional fixtures; switching the UI language never rewrites them. */
export const EN_EXAMPLES = {
 education: {
  name: 'student_enrollments_sample.csv',
  headers: ['Student ID', 'Name', 'Course', 'Phone', 'Email', 'Enrollment Date', 'Amount'],
  rows: [
   ['0001', ' Avery Stone ', 'Python Fundamentals', '+86 138-0000-0001', 'Avery@EXAMPLE.COM', '2026/09/01', '1,280.00'],
   ['0002', 'Jordan Reed', 'UI Design', '139 0000 0002', 'jordan@example.com', '2026/9/2', '980.00'],
   ['0003', 'Morgan Hale', 'Data Analysis', '13700000003', 'morgan.example.com', '2026-09-04', '1,680.00'],
   ['0004', '', 'Python Fundamentals', '13600000004', 'student4@example.com', '2026.9.5', '1,280.00'],
   ['0005', 'Casey Lane', 'Data Analysis', '13500000005', 'casey@example.com', '2026-09-06', '1680.00'],
   ['0006', 'Taylor Brooks', 'UI Design', '13400000006', 'taylor@EXAMPLE.COM', '2026/09/06', '980.00'],
   ['0002', 'Jordan Reed', 'UI Design', '13900000002', 'jordan@example.com', '2026-09-02', '980.00'],
   ['0007', 'Riley Quinn', 'Python Fundamentals', '1380007', 'riley@example.com', '2026/09/07', '1280.00'],
   ['0001', 'Avery Stone', 'Advanced Python', '13800000001', 'Avery@example.com', '2026/09/08', '1,880.00'],
   ['0008', 'Cameron Wells', 'UI Design', '13800000008', 'cameron@example.com', '09/10/2026', '980.00'],
   ['0009', 'Quinn Avery', 'Data Analysis', '13800000009', 'quinn@example.com', '2026/09/10', '1,68.00'],
   ['0010', ' Skyler Finch ', 'Python Fundamentals', '0086 13800000010', 'skyler@example.com', '2026/9/11', '1280.00'],
   ['0005', 'Casey Lane', 'Data Analysis', '13800000055', 'casey@example.com', '2026-09-06', '1680.00'],
   ['0011', 'Parker Ellis', 'UI Design', '13800000011', 'parker@example.com', '2026-09-12', '980.00'],
   ['', 'Drew Morgan', 'Python Fundamentals', '13800000012', 'drew@example.com', '2026-09-13', '1280.00'],
   ['0013', 'Sage Nolan', 'Data Analysis', '13800000013', 'sage@example.com', '2026-09-14', '1680.00'],
   ['0014', 'Reese Taylor', 'UI Design', '13800000014', 'reese@Example.com', '2026/09/15', '980.00'],
   ['0015', 'Eden Shaw', 'Python Fundamentals', '13800000015', 'eden@example.com', '2026-09-16', '1280.00'],
   ['0016', 'Rowan Clarke', 'Advanced Python', '13800000016', 'rowan@example.com', '2026-02-30', '1880.00'],
   ['', '', '', '', '', '', ''],
  ],
  requirements: 'Preserve leading zeros in Student ID;\nName and Student ID are required;\nCheck duplicates by Student ID + Course;\nNormalize Phone;\nNormalize Enrollment Date to YYYY-MM-DD.',
 },
 customer: {
  name: 'customer_records_sample.csv',
  headers: ['Customer ID', 'Customer Name', 'Contact', 'Phone', 'Email', 'Created At', 'Region'],
  rows: [
   ['C001', ' Northstar Labs ', 'Jordan Ellis', '+86 13800001001', 'Jordan@EXAMPLE.COM', '2026/09/01', 'North District'],
   ['C002', 'Maple Learning', 'Riley Hart', '139 0000 1002', 'riley@example.com', '2026/9/2', 'East District'],
   ['C003', 'Cedar Design', 'Morgan Lake', '13700001003', 'morgan.example.com', '2026-09-03', 'Lake District'],
   ['C001', 'Northstar Labs', 'Jordan Ellis', '13800001001', 'Jordan@example.com', '2026-09-01', 'North District'],
   ['C004', 'Harbor Studio', '', '13600001004', 'studio@example.com', '2026-09-04', 'West District'],
   ['C002', 'Maple Learning', 'Riley Hart', '13900001999', 'riley@example.com', '2026-09-02', 'East District'],
   ['C005', 'Willow Trading', 'Casey Reed', '13500001005', 'casey@EXAMPLE.COM', '2026/09/05', 'South District'],
   ['C006', 'Meadow Culture', 'Taylor Shaw', '12345', 'taylor@example.com', '09/06/2026', 'Central District'],
   ['C007', 'Orion Advisory', 'Avery Brook', '13400001007', '', '2026-09-07', 'River District'],
   ['C008', 'Breeze Systems', 'Sage Wells', '13800001008', 'sage@example.com', '2026-09-08', 'North District'],
  ],
  requirements: 'Trim all fields;\nCustomer ID and Customer Name are required;\nCheck duplicates by Customer ID;\nLowercase email domains.',
 },
 product: {
  name: 'product_catalog_sample.csv',
  headers: ['Product Code', 'Product Name', 'Variant', 'Unit', 'Price', 'Listed Date'],
  rows: [
   ['000101', ' Cotton T-shirt ', 'M / White', 'piece', '128.00', '2026/09/01'],
   ['000102', 'Canvas Tote', 'Standard', 'piece', '1,280.00', '2026/9/2'],
   ['000103', 'Ceramic Mug', '350 mL', 'piece', '68.00', '2026-09-03'],
   ['000101', 'Cotton T-shirt', 'M / White', 'piece', '128.00', '2026-09-01'],
   ['000103', 'Ceramic Mug', '500 mL', 'piece', '88.00', '2026-09-03'],
   ['000104', 'Notebook', 'A5', 'book', '2,9.00', '2026-09-04'],
   ['000105', '', 'L / Black', 'piece', '158.00', '2026/09/05'],
   ['000106', 'Storage Box', 'Large', 'piece', '59.90', '05/09/2026'],
   ['000107', 'Desk Lamp', 'Warm light', 'piece', '299.00', '2026-09-06'],
   ['000108', 'Bookends', 'Metal', 'pair', '-12.50', '2026-09-07'],
  ],
  requirements: 'Preserve leading zeros in Product Code;\nProduct Code and Product Name are required;\nCheck duplicates by Product Code;\nRemove thousands separators from Price;\nNormalize Listed Date to YYYY-MM-DD.',
 },
 generic: {
  name: 'general_table_sample.csv',
  headers: ['Record ID', 'Name', 'Email', 'Date', 'Quantity'],
  rows: [
   ['001', ' Woodland Project ', 'Project@EXAMPLE.COM', '2026/09/01', '1,000'],
   ['002', 'Coastline Plan', 'team@example.com', '2026/9/2', '50'],
   ['003', 'Meadow Team', 'team.example.com', '2026-09-03', '20'],
   ['001', 'Woodland Project', 'Project@example.com', '2026-09-01', '1000'],
   ['004', 'Cloud Workshop', 'cloud@example.com', '03/04/2026', '10'],
   ['005', 'Sunrise Plan', 'morning@example.com', '2026-09-05', '1,2'],
   ['006', 'Starlight Team', '', '2026-09-06', '0'],
   ['007', ' Bamboo Project ', 'green@Example.com', '2026/09/07', '30'],
  ],
  requirements: 'Trim all fields;\nPreserve leading zeros in Record ID;\nCheck duplicates by Record ID;\nNormalize Date to YYYY-MM-DD.',
 },
};

/** Choose a fresh fixture when loading it; existing table data is never relabeled. */
export function getExample(id, locale = getLocale()) {
 const example = (locale === 'en' ? EN_EXAMPLES : EXAMPLES)[id];
 if (!example) return undefined;
 return { ...example, headers: [...example.headers], rows: example.rows.map(row => [...row]) };
}
