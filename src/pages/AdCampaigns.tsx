import styles from './Dashboard.module.css';

export default function AdCampaigns() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Ad Campaigns</h1>
      </div>
      <div className={styles.noData}>
        Coming soon
      </div>
    </div>
  );
}
