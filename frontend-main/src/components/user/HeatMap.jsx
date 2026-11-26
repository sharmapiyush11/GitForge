import HeatMap from "@uiw/react-heat-map";

const HeatMapProfile = ({ activity = [] }) => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(endDate.getMonth() - 5);

  return (
    <div>
      <h3 style={{ marginTop: 0, marginBottom: 12 }}>
        Contribution Activity ({activity.reduce((a, b) => a + b.count, 0)}{" "}
        commits)
      </h3>
      <HeatMap
        style={{ width: "100%", color: "#8b949e" }}
        value={activity}
        weekLabels={["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]}
        startDate={startDate}
        endDate={endDate}
        rectSize={14}
        space={4}
        rectProps={{ rx: 2.5 }}
        panelColors={{
          0: "#161b22",
          1: "#0e4429",
          3: "#006d32",
          6: "#26a641",
          10: "#39d353",
        }}
      />
    </div>
  );
};

export default HeatMapProfile;
